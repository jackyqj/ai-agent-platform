/**
 * PG 持久化后端测试（平台自有套件，08 工单）。
 * - 跑仓库共享契约：runPersistenceContract（存储语义）+ runCoordinatorContract（写路径编排）
 * - 聚焦测试：torn-tail 修复 / readFrom 后缀
 * 运行：DATABASE_URL=postgres://.../dsh_pg_test pnpm vitest run packages/session/session-persistence-pg
 * 无 DATABASE_URL 时整组跳过（与仓库 e2e 自跳过约定一致）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session'
import PgSessionPersistence from '@deepseek-ai/dsh-session-persistence-pg'
import { runPersistenceContract, appendLog, oneTurnLog } from '../../session-persistence/tests/contract.ts'
import { runCoordinatorContract, type CoordinatorFixture } from '../../session-persistence/tests/coordinator-contract.ts'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
const describeDb = DATABASE_URL ? describe : describe.skip
const pool = DATABASE_URL ? new pg.Pool({ connectionString: DATABASE_URL }) : null

/** 每次 mount 前重建共享表（测试隔离；专用测试库 dsh_pg_test，schema 由 provider 首次挂载创建） */
async function wipe(): Promise<void> {
  await pool!.query('DROP TABLE IF EXISTS dsh_sessions.events CASCADE; DROP TABLE IF EXISTS dsh_sessions.sessions CASCADE')
}

runPersistenceContract('pg', async () => {
  await wipe()
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  const fiber = await ctx.plugin(PgSessionPersistence, { url: DATABASE_URL! })
  return {
    persistence: ctx.sessionPersistence,
    dispose: async () => { await fiber.dispose() },
  }
})

const fixture = async (): Promise<CoordinatorFixture> => {
  await wipe() // 每测试一次：多 mount 场景（resume）共享同一存储，不能在 mount 时清库
  return {
  mount: async (ctx) => ctx.plugin(PgSessionPersistence, { url: DATABASE_URL! }),
  corruptTail: async (id: SessionId) => {
    // committed 区域之后插一条 data 非法的行：scanRows 以它为 torn 边界
    const next = (await pool!.query(
      `SELECT COALESCE(MAX(seq), -1) + 1 AS n FROM dsh_sessions.events WHERE session_id = $1`,
      [id],
    )).rows[0]!.n
    await pool!.query(
      `INSERT INTO dsh_sessions.events (session_id, seq, type, time, data) VALUES ($1, $2, 'assistant/chunk', $3, '{broken json')`,
      [id, Number(next), Date.now()],
    )
  },
  cleanup: async () => {},
  }
}

runCoordinatorContract('pg', fixture)

describeDb('dsh-session-persistence-pg 聚焦', () => {
  let ctx: Context
  beforeEach(async () => {
    await wipe()
    ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(PgSessionPersistence, { url: DATABASE_URL! })
  })

  it('readFrom 只读后缀（seq >= from），seek 直接 SQL 不重扫全表', async () => {
    const session = ctx.sessions.create('pg-seek-1' as SessionId)
    appendLog(session, oneTurnLog()) // turn/start(0) user/message(1) step/start(2) assistant/message(3) step/end(4) turn/end(5)
    await ctx.sessions.flush(session)

    const { events } = await ctx.sessionPersistence.readFrom(session.id, 3)
    expect(events.map((e) => e.seq)).toEqual([3, 4, 5])
  })

  it('崩溃尾部修复：坏行在最后 turn/end 后 → load 平衡 + commitRepair 清掉 torn', async () => {
    const session = ctx.sessions.create('pg-repair-1' as SessionId)
    appendLog(session, oneTurnLog())
    await ctx.sessions.flush(session)

    // 注入 torn tail
    await pool!.query(
      `INSERT INTO dsh_sessions.events (session_id, seq, type, time, data) VALUES ($1, 99, 'assistant/chunk', $2, '{broken')`,
      [session.id, Date.now()],
    )
    const loaded = await ctx.sessionPersistence.load(session.id)
    expect(loaded.events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5])

    // load() 的平衡视图已排除 torn（内存合成）；物理修复路径由 coordinator 契约覆盖
    const again = await ctx.sessionPersistence.load(session.id)
    expect(again.events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5])
    expect(again.events!.at(-1)!.type).toBe('turn/end')
  })
})
