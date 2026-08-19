/**
 * PostgreSQL durable session-persistence backend. Maps each session header and
 * event to rows in the dedicated `dsh_sessions` schema, and delegates
 * write-path orchestration to {@link PersistenceCoordinator}.
 *
 * Platform-owned provider for the 08 工单 (shared session storage); ported from
 * the SQLite backend with the same crash-tail, seq-continuity, and
 * transaction-atomicity contracts. NOT an upstream contribution: repo gates
 * (coverage, invariants, doc-sync) are owned separately.
 *
 * @module @deepseek-ai/dsh-session-persistence-pg
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import {
  DEFAULT_PREPARED_SESSION_CACHE_SIZE, DEFAULT_WRITE_BATCH_MAX_DELAY_MS, MAX_WRITE_BATCH_DELAY_MS,
  SessionPersistence, SessionPersistenceRevision, PersistenceCoordinator,
  type PersistenceBackend, type SessionLocation, type SessionPersistenceSnapshot,
  type SessionInspection, type SessionPersistenceRevision as PersistenceRevision,
  type StoredPrefix, type StoredSuffix,
} from '@deepseek-ai/dsh-session-persistence'
import type { SessionEvent, SurfaceEventType, SessionId, SessionHeader, SessionPreparation } from '@deepseek-ai/dsh-session'
import {
  DDL, DSH_SCHEMA, rowToMeta, scanRows, toEventRow, toSessionRow,
  type EventRow, type SessionRow,
} from './schema.ts'

/** Serialize an event's optional envelope fields for SQL binding. */
function envelopeBindings(event: SessionEvent): [string | null, string | null, number | null] {
  const se = event as SessionEvent<SurfaceEventType>
  return [
    se.sourceEventSeqs ? JSON.stringify(se.sourceEventSeqs) : null,
    se.surfaceOp !== undefined ? JSON.stringify(se.surfaceOp) : null,
    event.ignorable === true ? 1 : null,
  ]
}

export interface Config {
  /** PostgreSQL connection string (the session store). */
  url: string
  /** Maximum cold Session preparations retained for history-to-resume reuse. */
  preparedSessionCacheSize?: number
  /** Fixed live-event coalescing window; not a backend completion deadline. */
  writeBatchMaxDelayMs?: number
}

export class PgSessionPersistence extends SessionPersistence implements PersistenceBackend<number> {
  override readonly supportsRawArtifacts = false

  static inject = ['sessions']

  static Config: z<Config> = z.object({
    url: z.string().required(),
    preparedSessionCacheSize: z.number().step(1).min(1).default(DEFAULT_PREPARED_SESSION_CACHE_SIZE),
    writeBatchMaxDelayMs: z.number().step(1).min(1).max(MAX_WRITE_BATCH_DELAY_MS)
      .default(DEFAULT_WRITE_BATCH_MAX_DELAY_MS),
  })

  override readonly name = 'session-persistence-pg'

  private pool!: pg.Pool
  private storeIdentity!: string
  private ready: Promise<void>
  private coordinator: PersistenceCoordinator<number>

  constructor(ctx: Context, public config: Config) {
    super(ctx)
    const preparedSessionCacheSize = config.preparedSessionCacheSize
      ?? DEFAULT_PREPARED_SESSION_CACHE_SIZE
    const writeBatchMaxDelayMs = config.writeBatchMaxDelayMs
      ?? DEFAULT_WRITE_BATCH_MAX_DELAY_MS
    this.ready = this.openStore(config.url)
    this.coordinator = new PersistenceCoordinator<number>(this.ctx, this, {
      preparedSessionCacheSize,
      writeBatchMaxDelayMs,
    })
  }

  private async openStore(url: string): Promise<void> {
    this.pool = new pg.Pool({ connectionString: url })
    await this.pool.query(DDL)
    const { rows } = await this.pool.query<{ store_id: string }>(
      `INSERT INTO ${DSH_SCHEMA}.persistence_state (singleton, store_id) VALUES (1, $1)
       ON CONFLICT (singleton) DO NOTHING RETURNING store_id`,
      [randomUUID()],
    )
    const row = rows[0]
      ?? (await this.pool.query<{ store_id: string }>(
        `SELECT store_id FROM ${DSH_SCHEMA}.persistence_state WHERE singleton = 1`,
      )).rows[0]
    if (!row || row.store_id.length === 0) {
      throw new Error('session store has no valid store identity')
    }
    this.storeIdentity = `${url.split('?')[0]}:store:${row.store_id}`
  }

  // --- SessionPersistence service API (delegated to the coordinator) ---

  /** PG has no independent per-session artifact. */
  locate(_meta: SessionHeader): SessionLocation | undefined {
    return undefined
  }

  create(meta: SessionHeader): Promise<void> {
    return this.coordinator.create(meta)
  }

  append(id: SessionId, events: readonly SessionEvent[]): Promise<void> {
    return this.coordinator.append(id, events)
  }

  override prepare(id: SessionId, signal?: AbortSignal): Promise<SessionPreparation> {
    return this.coordinator.prepare(id, signal)
  }

  load(id: SessionId): Promise<SessionInspection> {
    return this.coordinator.load(id)
  }

  inspect(id: SessionId, signal?: AbortSignal): Promise<SessionInspection> {
    return this.coordinator.inspect(id, signal)
  }

  readFrom(id: SessionId, fromSeq: number, signal?: AbortSignal): Promise<{ meta: SessionHeader; events: SessionEvent[] }> {
    return this.coordinator.readFrom(id, fromSeq, signal)
  }

  list(signal?: AbortSignal): Promise<SessionHeader[]> {
    return this.listStored(signal)
  }

  // --- PersistenceBackend hooks ---

  async loadStored(id: SessionId, signal?: AbortSignal): Promise<StoredPrefix<number> | undefined> {
    signal?.throwIfAborted()
    await this.ready
    signal?.throwIfAborted()
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const rowRes = await client.query(`SELECT * FROM ${DSH_SCHEMA}.sessions WHERE id = $1`, [id])
      const sessionRow = rowRes.rows[0] as Record<string, unknown> | undefined
      const snapshot = sessionRow
        ? {
            row: toSessionRow(sessionRow),
            eventRows: await this.queryEvents(client, id),
          }
        : undefined
      await client.query('COMMIT')
      if (snapshot === undefined) return undefined
      const { preserved, tornFrom } = scanRows(snapshot.eventRows)
      return {
        meta: rowToMeta(snapshot.row),
        events: preserved,
        revision: this.revision(snapshot.row),
        ...tornFrom !== undefined ? { tornMarker: tornFrom } : {},
      }
    } catch (error) {
      /* v8 ignore next 2 -- ROLLBACK 失败仅发生在 DB 级故障（磁盘满等），测试不可达 */
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async readStoredRevision(id: SessionId, signal?: AbortSignal): Promise<PersistenceRevision | undefined> {
    signal?.throwIfAborted()
    await this.ready
    signal?.throwIfAborted()
    const { rows } = await this.pool.query(
      `SELECT incarnation, revision FROM ${DSH_SCHEMA}.sessions WHERE id = $1`,
      [id],
    )
    const row = rows[0] as { incarnation: string; revision: string } | undefined
    return row === undefined
      ? undefined
      : this.revision({ incarnation: row.incarnation, revision: Number(row.revision) } as SessionRow)
  }

  async loadStoredFrom(id: SessionId, fromSeq: number, signal?: AbortSignal): Promise<StoredSuffix | undefined> {
    signal?.throwIfAborted()
    await this.ready
    signal?.throwIfAborted()
    const { rows } = await this.pool.query(
      `SELECT * FROM ${DSH_SCHEMA}.sessions WHERE id = $1`,
      [id],
    )
    if (rows.length === 0) return undefined
    const sessionRow = toSessionRow(rows[0] as Record<string, unknown>)
    const eventRows = await this.queryEvents(this.pool, id, fromSeq)
    signal?.throwIfAborted()
    const { preserved } = scanRows(eventRows, fromSeq)
    return { meta: rowToMeta(sessionRow), events: preserved }
  }

  async appendBatch(meta: SessionHeader, events: readonly SessionEvent[], isMaterialized: boolean): Promise<void> {
    await this.ready
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      if (!isMaterialized) await this.writeRow(client, meta)
      for (const event of events) {
        const [surfaceSeqs, surfaceOp, ignorable] = envelopeBindings(event)
        await client.query(
          `INSERT INTO ${DSH_SCHEMA}.events (session_id, seq, type, time, data, source_event_seqs, surface_op, ignorable)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [meta.id, event.seq, event.type, event.time, JSON.stringify(event.data), surfaceSeqs, surfaceOp, ignorable],
        )
      }
      await client.query(`UPDATE ${DSH_SCHEMA}.sessions SET revision = revision + 1 WHERE id = $1`, [meta.id])
      await client.query('COMMIT')
    } catch (error) {
      /* v8 ignore next 2 -- ROLLBACK 失败仅发生在 DB 级故障，测试不可达 */
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async commitRepair(meta: SessionHeader, tornMarker: number | undefined, closers: readonly SessionEvent[]): Promise<void> {
    await this.ready
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      if (tornMarker !== undefined) {
        await client.query(`DELETE FROM ${DSH_SCHEMA}.events WHERE session_id = $1 AND seq >= $2`, [meta.id, tornMarker])
      }
      for (const event of closers) {
        const [surfaceSeqs, surfaceOp, ignorable] = envelopeBindings(event)
        await client.query(
          `INSERT INTO ${DSH_SCHEMA}.events (session_id, seq, type, time, data, source_event_seqs, surface_op, ignorable)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [meta.id, event.seq, event.type, event.time, JSON.stringify(event.data), surfaceSeqs, surfaceOp, ignorable],
        )
      }
      if (tornMarker !== undefined || closers.length > 0) {
        await client.query(`UPDATE ${DSH_SCHEMA}.sessions SET revision = revision + 1 WHERE id = $1`, [meta.id])
      }
      await client.query('COMMIT')
    } catch (error) {
      /* v8 ignore next 2 -- ROLLBACK 失败仅发生在 DB 级故障，测试不可达 */
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async listStored(signal?: AbortSignal): Promise<SessionHeader[]> {
    signal?.throwIfAborted()
    await this.ready
    signal?.throwIfAborted()
    const { rows } = await this.pool.query(`SELECT * FROM ${DSH_SCHEMA}.sessions`)
    signal?.throwIfAborted()
    return rows.map((r) => rowToMeta(toSessionRow(r as Record<string, unknown>)))
  }

  async listSnapshots(signal?: AbortSignal): Promise<SessionPersistenceSnapshot[]> {
    signal?.throwIfAborted()
    await this.ready
    signal?.throwIfAborted()
    const { rows } = await this.pool.query(`SELECT * FROM ${DSH_SCHEMA}.sessions`)
    signal?.throwIfAborted()
    return rows.map((r) => {
      const row = toSessionRow(r as Record<string, unknown>)
      return { header: rowToMeta(row), revision: this.revision(row) }
    })
  }

  async close(): Promise<void> {
    await this.ready
    await this.pool.end()
  }

  // --- helpers ---

  private revision(row: SessionRow): PersistenceRevision {
    return SessionPersistenceRevision(
      `${this.storeIdentity}:incarnation:${row.incarnation}:revision:${row.revision}`,
    )
  }

  private async queryEvents(
    q: pg.Pool | pg.PoolClient,
    id: SessionId,
    fromSeq?: number,
  ): Promise<EventRow[]> {
    const { rows } = fromSeq === undefined
      ? await q.query(
          `SELECT seq, type, time, data, source_event_seqs, surface_op, ignorable
           FROM ${DSH_SCHEMA}.events WHERE session_id = $1 ORDER BY seq`,
          [id],
        )
      : await q.query(
          `SELECT seq, type, time, data, source_event_seqs, surface_op, ignorable
           FROM ${DSH_SCHEMA}.events WHERE session_id = $1 AND seq >= $2 ORDER BY seq`,
          [id, fromSeq],
        )
    return rows.map((r) => toEventRow(r as Record<string, unknown>))
  }

  /** Insert-or-replace a session's metadata row (lazy materialization on first append). */
  private async writeRow(client: pg.PoolClient, meta: SessionHeader): Promise<void> {
    await client.query(
      `INSERT INTO ${DSH_SCHEMA}.sessions
         (id, version, created_at, cwd, parent_session, seed_length, origin, delegation_depth, agent_preset, incarnation, revision)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0)
       ON CONFLICT (id) DO UPDATE SET
         version = excluded.version,
         created_at = excluded.created_at,
         cwd = excluded.cwd,
         parent_session = excluded.parent_session,
         seed_length = excluded.seed_length,
         origin = excluded.origin,
         delegation_depth = excluded.delegation_depth,
         agent_preset = excluded.agent_preset`,
      [
        meta.id, meta.version, meta.createdAt, meta.cwd ?? null, meta.parentSession ?? null,
        meta.seedLength ?? null, meta.origin ?? null, meta.delegationDepth ?? null,
        meta.agentPreset ?? null, randomUUID(),
      ],
    )
  }
}

export default PgSessionPersistence
