import { Injectable, Logger } from '@nestjs/common'
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
 *   用户信息 https://api.dingtalk.com/v1.0/contact/users/me（需通讯录权限，403 时降级老版免登接口）
 *   state 用 JWT 签名（防 CSRF），回调校验。
 */
@Injectable()
export class AuthService {
  private logger = new Logger('Auth')
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
    // 部门：OAuth userinfo 不返回部门（组织架构同步补齐前，角色走 D12 关键词/覆盖表）
    const user = this.users.upsert({ externalId, name, dept: '未知部门' })
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

  /**
   * 拉取登录用户信息（身份键 = unionId）。
   * 1) 新版 /v1.0/contact/users/me：信息全（nick/avatar），但需应用开通「通讯录个人信息读权限」；
   * 2) 兜底老版免登 oapi.dingtalk.com/user/getuserinfo：仅 unionid/userid，权限要求低（免登场景默认可用）。
   * 403（权限未开通）时自动降级，不再阻塞登录。
   */
  private async fetchUserInfo(accessToken: string): Promise<{ unionId: string; nick?: string; userId?: string }> {
    try {
      const res = await fetch(AuthService.USERINFO_URL, {
        headers: { 'x-acs-dingtalk-access-token': accessToken },
      })
      if (res.ok) {
        const json = (await res.json()) as { unionId?: string; nick?: string }
        if (json.unionId) return { unionId: json.unionId, nick: json.nick }
      }
      this.logger.warn(`users/me 不可用（HTTP ${res.status}），降级老版免登接口`)
    } catch {
      this.logger.warn('users/me 异常，降级老版免登接口')
    }
    const res = await fetch(`https://oapi.dingtalk.com/user/getuserinfo?access_token=${encodeURIComponent(accessToken)}`)
    const json = (await res.json()) as { errcode?: number; errmsg?: string; unionid?: string; userid?: string }
    if (json.errcode !== 0 || !json.unionid) {
      throw new Error(`钉钉 userinfo 失败: errcode=${json.errcode} ${json.errmsg ?? ''}（若为权限错误，请在开发者后台申请「通讯录个人信息读权限」）`)
    }
    return { unionId: json.unionid, userId: json.userid }
  }
}
