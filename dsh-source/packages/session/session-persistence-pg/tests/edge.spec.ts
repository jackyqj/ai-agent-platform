/**
 * 覆盖补齐测试（上游 100% 门禁）：直构 config 回退、空值/委托路径、
 * 错误路径 catch（约束冲突/表缺失）、scanRows committed 区 throw、schema 全字段分支。
 * 运行：DATABASE_URL=postgres://.../dsh_pg_test pnpm vitest run packages/session/session-persistence-pg
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session'
import PgSessionPersistence from '@deepseek-ai/dsh-session-persistence-pg'
import { rowToMeta, rowToEvent, scanRows, toSessionRow, toEventRow, type SessionRow, type EventRow } from '../src/schema.ts'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
const describeDb = DATABASE_URL ? describe : describe.skip
const pool = DATABASE_URL ? new pg.Pool({ connectionString: DATABASE_URL }) : null

describeDb('dsh-session-persistence-pg 覆盖补齐', () => {
  // ── schema 纯函数（无需 DB）──
  it('rowToMeta：全字段行 → 完整 header', () => {
    const row: SessionRow = {
      id: 's-1', version: 0, created_at: 1000, cwd: '/w',
      parent_session: 's-0', seed_length: 2, origin: 'subagent',
      incarnation: 'i', revision: 1, delegation_depth: 1, agent_preset: 'assistant',
    }
    const h = rowToMeta(row)
    expect(h.cwd).toBe('/w'); expect(h.parentSession).toBe('s-0')
    expect(h.seedLength).toBe(2); expect(h.origin).toBe('subagent')
    expect(h.delegationDepth).toBe(1); expect(h.agentPreset).toBe('assistant')
  })

  it('rowToMeta：created_at 非法 → throw', () => {
    expect(() => rowToMeta({ id: 'x', version: 0, created_at: -1 } as SessionRow)).toThrow(/non-negative/)
  })

  it('rowToEvent：全 surface 字段 + ignorable', () => {
    const e = rowToEvent({
      seq: 0, type: 'user/message', time: 1, data: '{"a":1}',
      source_event_seqs: '[1,2]', surface_op: '{"op":"append"}', ignorable: 1,
    }) as { sourceEventSeqs?: number[]; surfaceOp?: unknown; ignorable?: boolean }
    expect(e.sourceEventSeqs).toEqual([1, 2])
    expect(e.surfaceOp).toEqual({ op: 'append' })
    expect(e.ignorable).toBe(true)
  })

  it('rowToEvent：null surface 字段', () => {
    const e = rowToEvent({ seq: 0, type: 'turn/start', time: 1, data: '{}', source_event_seqs: null, surface_op: null, ignorable: null }) as { sourceEventSeqs?: number[]; surfaceOp?: unknown; ignorable?: boolean }
    expect(e.sourceEventSeqs).toBeUndefined()
    expect(e.surfaceOp).toBeUndefined()
    expect(e.ignorable).toBeUndefined()
  })

  it('scanRows：committed 区坏行（有效 turn/end 之后）→ throw', () => {
    // 坏行在 seq 0、有效 turn/end 在 seq 1 → 坏行位于 committed 区域 → throw
    const rows: EventRow[] = [
      { seq: 0, type: 'user/message', time: 1, data: '{broken', source_event_seqs: null, surface_op: null, ignorable: null },
      { seq: 1, type: 'turn/end', time: 2, data: '{}', source_event_seqs: null, surface_op: null, ignorable: null },
    ]
    expect(() => scanRows(rows)).toThrow(/corrupt session log/)
  })

  it('scanRows：committed 区 seq 空洞（空洞前有有效 turn/end）→ throw', () => {
    const rows: EventRow[] = [
      { seq: 0, type: 'user/message', time: 1, data: '{}', source_event_seqs: null, surface_op: null, ignorable: null },
      { seq: 2, type: 'turn/end', time: 2, data: '{}', source_event_seqs: null, surface_op: null, ignorable: null },
    ]
    expect(() => scanRows(rows)).toThrow(/seq gap in committed region/)
  })

  it('scanRows：torn 区 seq 空洞 → 保留前缀 + tornFrom（break 分支）', () => {
    const rows: EventRow[] = [
      { seq: 0, type: 'turn/end', time: 1, data: '{}', source_event_seqs: null, surface_op: null, ignorable: null },
      { seq: 5, type: 'assistant/chunk', time: 2, data: '{}', source_event_seqs: null, surface_op: null, ignorable: null },
    ]
    const { preserved, tornFrom } = scanRows(rows)
    expect(preserved.map((e) => e.seq)).toEqual([0])
    expect(tornFrom).toBe(1)
  })

  it('toSessionRow / toEventRow：全字段（含非空可选列）', () => {
    const s = toSessionRow({ id: 'a', version: 1, created_at: '5', cwd: '/w', parent_session: 'p', seed_length: '2', origin: 'subagent', incarnation: 'i', revision: '2', delegation_depth: '1', agent_preset: 'assistant' })
    expect(s.cwd).toBe('/w'); expect(s.parent_session).toBe('p'); expect(s.seed_length).toBe(2)
    expect(s.origin).toBe('subagent'); expect(s.delegation_depth).toBe(1); expect(s.agent_preset).toBe('assistant')
    const e = toEventRow({ seq: '1', type: 'x', time: '2', data: '{}', source_event_seqs: '[1]', surface_op: '{}', ignorable: '1' })
    expect(e.surface_op).toBe('{}'); expect(e.ignorable).toBe(1)
  })

  it('toSessionRow / toEventRow：全空值', () => {
    const s = toSessionRow({ id: 'a', version: 1, created_at: '5', cwd: null, parent_session: null, seed_length: null, origin: null, incarnation: 'i', revision: '2', delegation_depth: null, agent_preset: null })
    expect(s.cwd).toBeNull(); expect(s.revision).toBe(2)
    const e = toEventRow({ seq: '1', type: 'x', time: '2', data: '{}', source_event_seqs: null, surface_op: null, ignorable: null })
    expect(e.source_event_seqs).toBeNull()
  })

  // ── backend 边界（需要 DB）──
  let ctx: Context
  let fiber: { dispose: () => Promise<void> }
  beforeEach(async () => {
    await pool!.query('DROP TABLE IF EXISTS dsh_sessions.events CASCADE; DROP TABLE IF EXISTS dsh_sessions.sessions CASCADE')
    ctx = new Context()
    await ctx.plugin(SessionStore)
    fiber = await ctx.plugin(PgSessionPersistence, { url: DATABASE_URL! })
    // 插件 apply 不等待 openStore 的 DDL 完成；显式等 ready，避免与下一测试的 DROP 竞态
    await (ctx.sessionPersistence as unknown as { ready: Promise<void> }).ready
  })

  it('直构（绕过 schemastery 归一化）→ config 回退生效 + locate 返回 undefined', async () => {
    const c = new Context()
    await c.plugin(SessionStore)
    // 直构 backend（绕过 schemastery 归一化）：缺省 preparedSessionCacheSize/writeBatchMaxDelayMs → ?? 回退
    const raw = new PgSessionPersistence(c, { url: DATABASE_URL! })
    await raw['ready']
    expect(raw.locate({ version: 0, id: 'x' as SessionId, createdAt: 1 })).toBeUndefined()
    await raw.close()
  })

  it('prepare：已持久化会话（dispose live fiber，再冷 resume）→ SessionPreparation', async () => {
    const id = 'pg-prep-1' as SessionId
    const session = ctx.sessions.create(id)
    session.append('turn/start', { turn: 1 })
    await ctx.sessions.flush(session)
    // dispose 持久化 fiber → 会话脱离 live → 成为冷会话
    await fiber.dispose()
    const ctx2 = new Context()
    await ctx2.plugin(SessionStore)
    const fiber2 = await ctx2.plugin(PgSessionPersistence, { url: DATABASE_URL! })
    const prep = await ctx2.sessionPersistence.prepare(id)
    expect(prep).toBeDefined()
    expect(prep.session.id).toBe(id)
    await fiber2.dispose()
  })

  it('readStoredRevision：不存在的会话 → undefined', async () => {
    const backend = ctx.sessionPersistence as unknown as { readStoredRevision(id: SessionId): Promise<unknown> }
    expect(await backend.readStoredRevision('missing' as SessionId)).toBeUndefined()
  })

  it('openStore：store_id 为空 → 拒绝（校验分支）', async () => {
    await pool!.query(`UPDATE dsh_sessions.persistence_state SET store_id = '' WHERE singleton = 1`)
    const c = new Context()
    await c.plugin(SessionStore)
    // 直构 backend：触发 openStore 的 store_id 校验分支
    const raw = new PgSessionPersistence(c, { url: DATABASE_URL! })
    await expect(raw['ready']).rejects.toThrow(/no valid store identity/)
    // 恢复 store_id，避免污染后续测试的 mount
    await pool!.query(`UPDATE dsh_sessions.persistence_state SET store_id = gen_random_uuid()::text WHERE singleton = 1`)
    await raw.close().catch(() => undefined)
  })

  it('commitRepair 无操作调用（无 tornMarker、无 closers）→ 不抛错', async () => {
    const id = 'pg-noop-1' as SessionId
    const session = ctx.sessions.create(id)
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await ctx.sessions.flush(session)
    const header = { version: 0, id, createdAt: Date.now() }
    const backend = ctx.sessionPersistence as unknown as { commitRepair(meta: typeof header, torn: undefined, closers: never[]): Promise<unknown> }
    await backend.commitRepair(header, undefined, [])
  })

  it('appendBatch：重复 seq（唯一约束冲突）→ 整体回滚并拒绝', async () => {
    const id = 'pg-conflict-1' as SessionId
    const meta = { version: 0, id, createdAt: Date.now() }
    const ev = { type: 'turn/start' as const, seq: 0, time: Date.now(), data: { turn: 1 } }
    const backend = ctx.sessionPersistence as unknown as { appendBatch(meta: unknown, events: unknown[], materialized: boolean): Promise<unknown> }
    await backend.appendBatch(meta, [ev], false)
    // 再次 append 同 seq → 主键冲突 → 回滚 + 拒绝
    await expect(backend.appendBatch(meta, [ev], true)).rejects.toThrow()
  })

  it('commitRepair：closer 与已存在 seq 冲突 → 回滚并拒绝', async () => {
    const id = 'pg-repair-conflict' as SessionId
    const meta = { version: 0, id, createdAt: Date.now() }
    const backend = ctx.sessionPersistence as unknown as {
      appendBatch(meta: unknown, events: unknown[], materialized: boolean): Promise<unknown>
      commitRepair(meta: unknown, torn: undefined, closers: unknown[]): Promise<unknown>
    }
    await backend.appendBatch(meta, [{ type: 'turn/end' as const, seq: 0, time: Date.now(), data: { turn: 1, reason: { kind: 'completed' } } }], false)
    await expect(backend.commitRepair(meta, undefined, [{ type: 'turn/start' as const, seq: 0, time: Date.now(), data: {} }])).rejects.toThrow()
  })

  it('loadStored：底层查询失败 → ROLLBACK 并拒绝（错误路径）', async () => {
    // 先落一个会话，再删表让 loadStored 的查询失败 → 走 catch(ROLLBACK+throw)
    const id = 'pg-fail-1' as SessionId
    const session = ctx.sessions.create(id)
    session.append('turn/start', { turn: 1 })
    await ctx.sessions.flush(session)
    await pool!.query('DROP TABLE IF EXISTS dsh_sessions.sessions CASCADE')
    const backend = ctx.sessionPersistence as unknown as { loadStored(id: SessionId): Promise<unknown> }
    await expect(backend.loadStored(id)).rejects.toThrow()
  })
})
