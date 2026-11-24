/**
 * PG persistence backend tests (platform-owned, 08 工单).
 * Runs: DATABASE_URL=postgres://.../dsh_pg_test pnpm vitest run packages/session/session-persistence-pg
 * Skips the suite when DATABASE_URL is unset.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import { SESSION_FORMAT_VERSION, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import PgSessionPersistence from '@deepseek-ai/dsh-session-persistence-pg'
import { LIVE_WRITE_BATCH_MAX_DELAY_MS } from '../src/storage.ts'
import { runPersistenceContract, oneTurnLog } from '../../session-persistence/tests/contract.ts'
import { runLiveWritePathContract } from '../../session-persistence/tests/live-write-contract.ts'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
const describeDb = DATABASE_URL ? describe : describe.skip
const pool = DATABASE_URL ? new pg.Pool({ connectionString: DATABASE_URL }) : null

async function wipe(): Promise<void> {
  await pool!.query('DROP SCHEMA IF EXISTS dsh_sessions CASCADE')
}

async function instance(): Promise<{ persistence: SessionPersistence; dispose: () => Promise<void> }> {
  const ctx = new Context()
  const fiber = await ctx.plugin(PgSessionPersistence, { url: DATABASE_URL! })
  return {
    persistence: ctx.sessionPersistence,
    dispose: async () => { await fiber.dispose() },
  }
}

if (DATABASE_URL) {
  runPersistenceContract('pg', async () => {
    await wipe()
    const primary = await instance()
    return {
      persistence: primary.persistence,
      dispose: primary.dispose,
      reopen: instance,
      corruptTail: async (id: SessionId) => {
        const next = Number((await pool!.query(
          `SELECT COALESCE(MAX(seq), -1) + 1 AS n FROM dsh_sessions.events WHERE session_id = $1`,
          [id],
        )).rows[0]!.n)
        await pool!.query(
          `INSERT INTO dsh_sessions.events (session_id, seq, type, time, data) VALUES ($1, $2, 'assistant/chunk', $3, '{broken json')`,
          [id, next, Date.now()],
        )
      },
    }
  })

  runLiveWritePathContract('pg', LIVE_WRITE_BATCH_MAX_DELAY_MS, async () => {
    await wipe()
    const mount = async (): Promise<Context> => {
      const ctx = new Context()
      await ctx.plugin(SessionStore)
      await ctx.plugin(PgSessionPersistence, { url: DATABASE_URL! })
      return ctx
    }
    return { ctx: await mount(), remount: mount }
  })
}

describeDb('dsh-session-persistence-pg 聚焦', () => {
  let ctx: Context
  beforeEach(async () => {
    await wipe()
    ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(PgSessionPersistence, { url: DATABASE_URL! })
  })

  it('handle.read(offset) 只返回后缀', async () => {
    const handle = await ctx.sessionPersistence.create({
      version: SESSION_FORMAT_VERSION,
      id: SessionId('pg-seek-1'),
      createdAt: 1000,
      isSeeded: false,
    })
    await handle.append(oneTurnLog())
    expect((await handle.read(3)).events.map((event) => event.seq)).toEqual([3, 4, 5])
    await handle.close()
  })

  it('create(parentSource) 复制并持久化完整 fork 历史', async () => {
    const events = oneTurnLog()
    const parent = await ctx.sessionPersistence.create({
      version: SESSION_FORMAT_VERSION,
      id: SessionId('pg-fork-parent'),
      createdAt: 1000,
      isSeeded: false,
    })
    await parent.append(events)
    await parent.close()

    const child = await ctx.sessionPersistence.create({
      version: SESSION_FORMAT_VERSION,
      id: SessionId('pg-fork-child'),
      createdAt: 1001,
      parentSession: parent.id,
      isSeeded: false,
    }, {
      parentSource: {
        sessionId: parent.id,
        endSeq: SessionLogOffset(events.length),
        events,
      },
    })
    const result = await child.read()
    expect(result.events.map((event) => event.seq)).toEqual(events.map((event) => event.seq))
    expect(result.eventState).toBe('shared-frozen')
    expect(Object.isFrozen(result.events[0])).toBe(true)
    await child.close()

    const reopened = await ctx.sessionPersistence.open(child.id, 'read')
    expect((await reopened.read()).events.map((event) => event.seq)).toEqual(events.map((event) => event.seq))
    await reopened.close()
  })

  it('create(parentSource) 将空 fork 历史物化为可恢复会话', async () => {
    const child = await ctx.sessionPersistence.create({
      version: SESSION_FORMAT_VERSION,
      id: SessionId('pg-fork-empty'),
      createdAt: 1000,
      isSeeded: false,
    }, {
      parentSource: {
        sessionId: SessionId('pg-fork-empty-parent'),
        endSeq: SessionLogOffset(0),
        events: [],
      },
    })
    await child.close()

    expect(await ctx.sessionPersistence.stat(child.id)).toBeDefined()
  })
})
