// 钉钉开放平台 API 客户端（18 工单）：应用凭证 / 用户映射 / 会话回复
import { loadConfig } from '../config/config.js'

const TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/accessToken'
const CONTACT_USER_URL = 'https://api.dingtalk.com/v1.0/contact/users'

export class DingtalkApi {
  private cfg = loadConfig()
  private tokenCache: { token: string; expiresAt: number } | null = null

  /** 企业内部应用 accessToken（缓存 1 小时，提前 5 分钟过期） */
  async appToken(): Promise<string> {
    const now = Date.now()
    if (this.tokenCache && this.tokenCache.expiresAt > now) return this.tokenCache.token
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appKey: this.cfg.dingtalk.clientId, appSecret: this.cfg.dingtalk.clientSecret }),
    })
    const json = (await res.json()) as { accessToken?: string; message?: string }
    if (!json.accessToken) throw new Error(`钉钉 appToken 失败: ${json.message ?? res.status}`)
    this.tokenCache = { token: json.accessToken, expiresAt: now + 3600_000 - 300_000 }
    return json.accessToken
  }

  /** staffId（消息里的 senderStaffId）→ unionId（与 Web SSO 同一身份键）；失败时返回 undefined */
  async staffToUnionId(staffId: string): Promise<string | undefined> {
    if (!staffId) return undefined
    try {
      const token = await this.appToken()
      const res = await fetch(`${CONTACT_USER_URL}/${encodeURIComponent(staffId)}`, {
        headers: { 'x-acs-dingtalk-access-token': token },
      })
      if (!res.ok) return undefined
      const json = (await res.json()) as { unionId?: string }
      return json.unionId
    } catch {
      return undefined
    }
  }

  /** 通过 sessionWebhook 回复 markdown（单聊/群聊通用） */
  async replyMarkdown(sessionWebhook: string, title: string, text: string): Promise<void> {
    if (!sessionWebhook) return
    const token = await this.appToken()
    await fetch(sessionWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-acs-dingtalk-access-token': token },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { title, text } }),
    })
  }
}
