import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { loadConfig } from '../config/config.js'
import { AuditStore } from '../common/audit.store.js'
import { UsersService } from '../users/users.service.js'
import type { AuthUser } from '../common/auth.guard.js'

export type AuthMode = 'dev' | 'oidc'

/**
 * 认证服务（07 工单 + D8/D12）：
 * - dev 模式：/auth/dev/login 直接签发 JWT（本地开发/冒烟）
 * - oidc 模式：钉钉企业内应用 OAuth 授权码流程（CP_OIDC_* 配置）
 *   钉钉是自定义 OAuth（无 OIDC discovery），走其专有端点：
 *   授权 https://login.dingtalk.com/oauth2/auth
 *   换票 https://api.dingtalk.com/v1.0/oauth2/userAccessToken
 *   用户信息 https://api.dingtalk.com/v1.0/contact/users/me
 *   state 用 JWT 签名（防 CSRF），回调校验。
 */
@Injectable()
export class AuthService {
  private cfg = loadConfig()

  private static readonly AUTH_URL = 'https://login.dingtalk.com/oauth2/auth'
  private static readonly TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken'
  private static readonly USERINFO_URL = 'https://api.dingtalk.com/v1.0/contact/users/me'

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

  /**
   * oidc 模式：构造钉钉授权 URL。
   * state 为 JWT 签名值（10 分钟），回调时校验防 CSRF。
   */
  buildAuthUrl(): string {
    const { clientId, clientSecret, redirectUri } = this.cfg.oidc
    if (!clientId || !clientSecret) {
      throw new Error('oidc not configured (CP_OIDC_CLIENT_ID / CP_OIDC_CLIENT_SECRET)')
    }
    const state = this.jwt.sign({ nonce: Math.random().toString(36).slice(2) }, {
      secret: this.cfg.jwtSecret,
      expiresIn: '10m',
    })
    const params = new URLSearchParams({
      redirect_uri: redirectUri,
      response_type: 'code',
      client_id: clientId,
      scope: 'openid',
      state,
      prompt: 'consent',
    })
    return `${AuthService.AUTH_URL}?${params.toString()}`
  }

  /**
   * oidc 模式：回调换票 + 身份映射 + JWT 签发。
   * 钉钉流程：code → userAccessToken（clientId/clientSecret/grantType）→ users/me（unionId/nick）。
   */
  async oidcCallback(code: string, state?: string): Promise<{ user: AuthUser; accessToken: string }> {
    this.verifyState(state)
    const tokens = await this.exchangeCode(code)
    const profile = await this.fetchUserInfo(tokens.accessToken)
    const externalId = String(profile.unionId ?? '')
    if (!externalId) throw new Error('钉钉 userinfo 缺少 unionId')
    const name = String(profile.nick ?? externalId)
    const user = this.users.upsert({ externalId, name, dept: String(profile.dept ?? '未知部门') })
    const token = this.issueToken(this.users.toAuthUser(user))
    this.audit.append({ userId: user.id, eventType: 'auth.login', payload: { mode: 'oidc', externalId } })
    return { user: this.users.toAuthUser(user), accessToken: token.accessToken }
  }

  private verifyState(state?: string) {
    if (!state) throw new Error('oidc: missing state (CSRF check failed)')
    try {
      this.jwt.verify(state, { secret: this.cfg.jwtSecret })
    } catch {
      throw new Error('oidc: invalid state (CSRF check failed)')
    }
  }

  private async exchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string; expireIn?: number }> {
    const { clientId, clientSecret } = this.cfg.oidc
    const res = await fetch(AuthService.TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret, code, grantType: 'authorization_code' }),
    })
    const json = (await res.json()) as Record<string, string>
    if (!json.accessToken) {
      throw new Error(`钉钉换票失败: ${json.message ?? json.error ?? `HTTP ${res.status}`}`)
    }
    return json as unknown as { accessToken: string; refreshToken?: string; expireIn?: number }
  }

  private async fetchUserInfo(accessToken: string): Promise<Record<string, string>> {
    const res = await fetch(AuthService.USERINFO_URL, {
      headers: { 'x-acs-dingtalk-access-token': accessToken },
    })
    if (!res.ok) throw new Error(`钉钉 userinfo 失败: HTTP ${res.status}`)
    return (await res.json()) as Record<string, string>
  }
}
