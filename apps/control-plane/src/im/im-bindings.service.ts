// IM Agent 绑定（18 续）：门户「开通钉钉入口」→ 绑定表；关键词/优先级路由
// robot_code 列预留 1:1 专用机器人，本期读写忽略。
import { Injectable, Logger } from '@nestjs/common'
import { PgStore, type ImAgentBindingView, type ImConversationRow } from '../store/pg.store.js'

export type ImRouteResult =
  | { kind: 'preset'; presetId: string }
  | { kind: 'ambiguous'; agents: Array<{ id: string; name: string; keywords: string[] }> }
  | { kind: 'none' }

@Injectable()
export class ImBindingsService {
  private logger = new Logger('ImBindings')
  private memoryBindings = new Map<string, ImAgentBindingView>()
  private memoryConversations = new Map<string, ImConversationRow>()

  constructor(private readonly pg: PgStore) {}

  private persist(): boolean {
    return this.pg.pool !== null
  }

  private convKey(conversationId: string, userId: string): string {
    return `${conversationId}\0${userId}`
  }

  async enable(
    presetId: string,
    opts: {
      keywords?: string[]
      priority?: number
      enabledBy?: string
      agentName?: string
      agentStatus?: string
    } = {},
  ): Promise<ImAgentBindingView> {
    const keywords = (opts.keywords ?? []).map((k) => k.trim()).filter(Boolean)
    const priority = opts.priority ?? 0
    if (this.persist()) {
      const row = await this.pg.upsertImAgentBinding({
        presetId,
        enabled: true,
        keywords,
        priority,
        enabledBy: opts.enabledBy,
      })
      return {
        ...row,
        agentName: opts.agentName ?? null,
        agentStatus: opts.agentStatus ?? 'published',
      }
    }
    const view: ImAgentBindingView = {
      presetId,
      enabled: true,
      keywords,
      priority,
      robotCode: null,
      enabledBy: opts.enabledBy ?? null,
      enabledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      agentName: opts.agentName ?? presetId,
      agentStatus: opts.agentStatus ?? 'published',
    }
    this.memoryBindings.set(presetId, view)
    return view
  }

  async disable(presetId: string, meta?: { agentName?: string; agentStatus?: string }): Promise<ImAgentBindingView | undefined> {
    if (this.persist()) {
      const row = await this.pg.disableImAgentBinding(presetId)
      if (!row) {
        return {
          presetId,
          enabled: false,
          keywords: [],
          priority: 0,
          robotCode: null,
          enabledBy: null,
          enabledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          agentName: meta?.agentName ?? null,
          agentStatus: meta?.agentStatus ?? null,
        }
      }
      return {
        ...row,
        agentName: meta?.agentName ?? null,
        agentStatus: meta?.agentStatus ?? null,
      }
    }
    const existing = this.memoryBindings.get(presetId)
    if (!existing) {
      return {
        presetId,
        enabled: false,
        keywords: [],
        priority: 0,
        robotCode: null,
        enabledBy: null,
        enabledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agentName: meta?.agentName ?? null,
        agentStatus: meta?.agentStatus ?? null,
      }
    }
    const next = { ...existing, enabled: false, updatedAt: new Date().toISOString(), ...meta }
    this.memoryBindings.set(presetId, next)
    return next
  }

  /** Agent 下架时关闭入口（幂等） */
  async disableOnUnpublish(presetId: string): Promise<void> {
    try {
      await this.disable(presetId)
    } catch (e) {
      this.logger.warn(`disableOnUnpublish ${presetId}: ${(e as Error).message}`)
    }
  }

  async get(presetId: string): Promise<ImAgentBindingView | undefined> {
    if (this.persist()) {
      const row = await this.pg.getImAgentBinding(presetId)
      if (!row) return undefined
      return { ...row, agentName: null, agentStatus: null }
    }
    return this.memoryBindings.get(presetId)
  }

  async listAll(): Promise<ImAgentBindingView[]> {
    if (this.persist()) return this.pg.listImAgentBindings()
    return [...this.memoryBindings.values()].sort((a, b) => b.priority - a.priority || a.presetId.localeCompare(b.presetId))
  }

  async listEnabled(): Promise<ImAgentBindingView[]> {
    if (this.persist()) return this.pg.listEnabledImAgentBindings()
    return [...this.memoryBindings.values()]
      .filter((b) => b.enabled && b.agentStatus === 'published')
      .sort((a, b) => b.priority - a.priority || a.presetId.localeCompare(b.presetId))
  }

  async countEnabled(): Promise<number> {
    if (this.persist()) return this.pg.countEnabledImAgentBindings()
    return (await this.listEnabled()).length
  }

  /** 关键词命中最高 priority；无命中则单入口回退，多入口 ambiguous */
  route(text: string, bindings: ImAgentBindingView[]): ImRouteResult {
    if (bindings.length === 0) return { kind: 'none' }
    const hits = bindings.filter((b) => b.keywords.some((k) => k && text.includes(k)))
    if (hits.length > 0) {
      hits.sort((a, b) => b.priority - a.priority || a.presetId.localeCompare(b.presetId))
      return { kind: 'preset', presetId: hits[0]!.presetId }
    }
    if (bindings.length === 1) return { kind: 'preset', presetId: bindings[0]!.presetId }
    return {
      kind: 'ambiguous',
      agents: bindings.map((b) => ({
        id: b.presetId,
        name: b.agentName ?? b.presetId,
        keywords: b.keywords,
      })),
    }
  }

  /** 按 id 或名称（忽略大小写）解析已开通 Agent */
  resolveEnabled(query: string, bindings: ImAgentBindingView[]): ImAgentBindingView | undefined {
    const q = query.trim().toLowerCase()
    if (!q) return undefined
    return (
      bindings.find((b) => b.presetId.toLowerCase() === q) ??
      bindings.find((b) => (b.agentName ?? '').toLowerCase() === q)
    )
  }

  async getConversation(conversationId: string, userId: string): Promise<ImConversationRow | undefined> {
    if (!conversationId || !userId) return undefined
    if (this.persist()) return this.pg.getImConversation(conversationId, userId)
    return this.memoryConversations.get(this.convKey(conversationId, userId))
  }

  async upsertConversation(c: {
    conversationId: string
    userId: string
    presetId: string
    sessionId: string
    convType?: string
  }): Promise<void> {
    if (this.persist()) {
      await this.pg.upsertImConversation(c)
      return
    }
    this.memoryConversations.set(this.convKey(c.conversationId, c.userId), {
      conversationId: c.conversationId,
      userId: c.userId,
      presetId: c.presetId,
      sessionId: c.sessionId,
      convType: c.convType ?? null,
      updatedAt: new Date().toISOString(),
    })
  }
}
