// 审计事件（enterprise-shell §3.8）：登录/会话/管理操作全量落库
// 后端：DATABASE_URL 配置 → PG（audit_events 表）；否则内存（开发/冒烟）
import { Injectable } from '@nestjs/common'
import { PgStore } from '../store/pg.store.js'

export interface AuditEvent {
  id: number
  userId?: string
  sessionId?: string
  eventType: string
  payload: unknown
  ts: string
}

@Injectable()
export class AuditStore {
  private memory: AuditEvent[] = []
  private nextId = 1
  private pg: PgStore

  constructor(pg: PgStore) {
    this.pg = pg
  }

  async append(ev: Omit<AuditEvent, 'id' | 'ts'>): Promise<AuditEvent> {
    if (this.pg.pool) {
      try {
        const row = await this.pg.appendAudit(ev)
        return { ...row, userId: row.userId ?? undefined, sessionId: row.sessionId ?? undefined }
      } catch (err) {
        // 审计失败必须 fail-soft：不阻断主流程，回退内存并告警（shell §3.8）
        console.error('[audit] PG write failed, falling back to memory:', (err as Error).message)
      }
    }
    const record: AuditEvent = { ...ev, id: this.nextId++, ts: new Date().toISOString() }
    this.memory.push(record)
    return record
  }

  async query(f: { userId?: string; eventType?: string; from?: string; limit: number }): Promise<AuditEvent[]> {
    if (this.pg.pool) {
      try {
        return (await this.pg.queryAudit(f)).map((r) => ({
          ...r,
          userId: r.userId ?? undefined,
          sessionId: r.sessionId ?? undefined,
        }))
      } catch (err) {
        console.error('[audit] PG query failed, falling back to memory:', (err as Error).message)
      }
    }
    let rows = this.memory
    if (f.userId) rows = rows.filter((e) => e.userId === f.userId)
    if (f.eventType) rows = rows.filter((e) => e.eventType === f.eventType)
    if (f.from) rows = rows.filter((e) => e.ts >= f.from!)
    return rows.slice(-f.limit).reverse()
  }
}
