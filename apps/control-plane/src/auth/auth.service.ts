import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Issuer, generators } from 'openid-client'
import { loadConfig } from '../config/config.js'
import { AuditStore } from '../common/audit.store.js'
import { UsersService } from '../users/users.service.js'
import type { AuthUser } from '../common/auth.guard.js'

export type AuthMode = 'dev' | 'oidc'

/**
 * 认证服务（07 工单 + D8/D12）：
 * - dev 模式：/auth/dev/login 直接签发 JWT（本地开发/冒烟）
 * - oidc 模式：钉钉 OIDC 授权码流程（/auth/sso/login → 重定向 IDP → callback 换票）
 *   钉钉为自定义 OAuth，接入时用其 OIDC 兼容端点配置（issuer/clientId/secret）
 */
@Injectable()
export class AuthService {
  private cfg = loadConfig()

  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly audit: AuditStore,
  ) {}

  issueToken(user: AuthUser): { accessToken: string; expiresIn: number } {
    return {
      accessToken: this.jwt.sign(user, { secret: this.cfg.jwtSecret, expiresIn: this.cfg.jwtTtl }),
      expiresIn: 7200,
    }
  }

  /** dev 模式：按用户 id 签发（仅本地开发；生产禁开） */
  devLogin(userId: string) {
    const u = this.users.get(userId)
    if (!u) throw new Error(`unknown user: ${userId}`)
    if (u.status !== 'active') throw new Error(`user disabled: ${userId}`)
    const token = this.issueToken(this.users.toAuthUser(u))
    this.audit.append({ userId, eventType: 'auth.login', payload: { mode: 'dev' } })
    return { user: u, ...token }
  }

  /** oidc 模式：构造授权 URL（用 openid-client 发现端点） */
  async buildAuthUrl(): Promise<string> {
    const client = await this.client()
    const state = generators.state()
    const nonce = generators.nonce()
    return client.authorizationUrl({ scope: this.cfg.oidc.scope, state, nonce })
  }

  /** oidc 模式：回调换票 + 身份映射 + JWT 签发 */
  async oidcCallback(code: string): Promise<{ user: AuthUser; accessToken: string }> {
    const client = await this.client()
    const tokens = await client.callback(this.cfg.oidc.redirectUri, { code })
    const claims = tokens.claims()
    const externalId = String(claims.sub ?? claims.unionid ?? '')
    if (!externalId) throw new Error('oidc: missing sub claim')
    const name = String(claims.name ?? externalId)
    const dept = String((claims as Record<string, unknown>).department ?? '未知部门')
    const user = this.users.upsert({ externalId, name, dept })
    const token = this.issueToken(this.users.toAuthUser(user))
    this.audit.append({ userId: user.id, eventType: 'auth.login', payload: { mode: 'oidc', externalId } })
    return { user: this.users.toAuthUser(user), accessToken: token.accessToken }
  }

  private async client() {
    const { issuer, clientId, clientSecret, redirectUri } = this.cfg.oidc
    if (!issuer || !clientId || !clientSecret) throw new Error('oidc not configured (CP_OIDC_*)')
    const discovered = await Issuer.discover(issuer)
    return new discovered.Client({ client_id: clientId, client_secret: clientSecret, redirect_uris: [redirectUri] })
  }
}
