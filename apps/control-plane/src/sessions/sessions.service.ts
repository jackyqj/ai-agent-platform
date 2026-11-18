import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { AuditStore } from '../common/audit.store.js'
import { PgStore } from '../store/pg.store.js'
import { InstancesService } from '../instances/instances.service.js'

export interface Session {
  id: string
  userId: string
  agentPresetId: string
  type: 'web' | 'rpc'
  instanceId?: string
  routingSecret: string
  status: 'active' | 'idle' | 'closed'
  createdAt: string
  lastActiveAt: string
}

export type AdminSessionView = Omit<Session, 'routingSecret'>

/**
 * 会话路由（enterprise-shell §3.3）：用户 ↔ 会话 ↔ 实例映射 + routing_secret
 * 持久化（08）：PG sessions 表为主存储（跨实例/重启可恢复）；PG 不可用时回退内存。
 * 逻辑会话（D22）：员工 `POST /sessions` 只建 `type='rpc'` 逻辑行（无 instanceId），
 * 任务由 Worker 复用该 `sessionId` 跨轮执行；DSH Web 实例降为远期「工作室」。
 */
@Injectable()
export class SessionsService {
  private memory = new Map<string, Session>()

  constructor(
    private readonly instances: InstancesService,
    private readonly audit: AuditStore,
    private readonly pg: PgStore,
  ) {}

  private async persist(): Promise<boolean> {
    return this.pg.pool !== null
  }

  async create(userId: string, agentPresetId = 'assistant', permissionMode = 'workspace-write'): Promise<Session> {
    // 逻辑会话（D22）：员工对话走 JSON-RPC 任务池，不启动 Web 实例、不占 maxConcurrentInstances
    const session: Session = {
      id: randomUUID(),
      userId,
      agentPresetId,
      type: 'rpc',
      routingSecret: randomUUID(),
      status: 'active',
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    }
    if (await this.persist()) {
      await this.pg.insertSession(session)
    } else {
      this.memory.set(session.id, session)
    }
    await this.audit.append({ userId, sessionId: session.id, eventType: 'session.create', payload: { agentPresetId, permissionMode } })
    return session
  }

  async listForUser(userId: string): Promise<Session[]> {
    if (await this.persist()) {
      try {
        return await this.pg.listSessions(userId)
      } catch (e) {
        console.error('[sessions] PG list failed, falling back:', (e as Error).message)
      }
    }
    return [...this.memory.values()].filter((s) => s.userId === userId && s.status !== 'closed')
  }

  async listAdmin(f: { userId?: string; from?: string; to?: string; limit?: number }): Promise<AdminSessionView[]> {
    const limit = Math.min(Math.max(f.limit ?? 100, 1), 200)
    let rows: Session[]
    if (await this.persist()) {
      try {
        rows = await this.pg.listSessionsAdmin({ ...f, limit })
      } catch (e) {
        console.error('[sessions] PG admin list failed, falling back:', (e as Error).message)
        rows = [...this.memory.values()]
      }
    } else {
      rows = [...this.memory.values()]
    }
    if (f.userId) rows = rows.filter((s) => s.userId === f.userId)
    if (f.from) rows = rows.filter((s) => toIso(s.createdAt) >= f.from!)
    if (f.to) rows = rows.filter((s) => toIso(s.createdAt) <= f.to!)
    return rows.slice(0, limit).map(toAdminView)
  }

  async get(id: string): Promise<Session | undefined> {
    if (await this.persist()) {
      try {
        const row = await this.pg.getSession(id)
        if (row) return row
      } catch (e) {
        console.error('[sessions] PG get failed, falling back:', (e as Error).message)
      }
    }
    return this.memory.get(id)
  }

  async close(id: string, userId: string): Promise<void> {
    const s = (await this.get(id)) ?? this.memory.get(id)
    if (!s || s.userId !== userId) return
    s.status = 'closed'
    s.lastActiveAt = new Date().toISOString()
    if (await this.persist()) {
      await this.pg.updateSessionStatus(id, 'closed')
    } else {
      this.memory.set(id, s)
    }
    if (s.instanceId) await this.instances.stop(s.instanceId)
    await this.audit.append({ userId, sessionId: id, eventType: 'session.close', payload: {} })
  }

  async closeAllForUser(userId: string): Promise<void> {
    const open = await this.listForUser(userId)
    for (const s of open) {
      await this.close(s.id, userId)
    }
  }
}

function toAdminView(s: Session): AdminSessionView {
  const { routingSecret: _secret, ...rest } = s
  return rest
}

function toIso(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString()
}
