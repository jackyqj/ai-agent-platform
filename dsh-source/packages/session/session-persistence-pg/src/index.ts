/**
 * PostgreSQL durable session-persistence backend. Maps each session header and
 * event to rows in the dedicated `dsh_sessions` schema and serves the
 * handle-based `SessionPersistence` API.
 *
 * Platform-owned provider for the 08 工单. NOT an upstream contribution.
 *
 * @module @deepseek-ai/dsh-session-persistence-pg
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import {
  SessionPersistence, SessionPersistenceRevision,
  SessionAlreadyExistsError, SessionPersistenceNotFoundError,
  assertStoredId, assertVersion, materializeCreateHeader, validateStoredEvents,
  type SessionAccess, type SessionHandle,
  type SessionHandleReadResult,
  type SessionPersistenceCreateOptions,
  type SessionPersistenceListOptions, type SessionPersistenceOpenOptions,
  type SessionPersistenceSnapshot, type SessionPersistenceStatOptions,
  type SessionPersistenceRevision as PersistenceRevision,
} from '@deepseek-ai/dsh-session-persistence'
import { SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionId, SessionHeader, SessionLogOffset as SessionLogOffsetType, SurfaceEventType } from '@deepseek-ai/dsh-session'
import { PgBackendTracker, PgSessionHandle } from './storage.ts'
import { SessionWriteLease } from './lease.ts'
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

function freezeStoredEvents(events: SessionEvent[]): void {
  const pending: object[] = [...events]
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined) continue
    Object.freeze(current)
    for (const value of Object.values(current)) {
      if (value !== null && typeof value === 'object') pending.push(value)
    }
  }
  Object.freeze(events)
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code: string }).code === '23505'
}

function assertInheritedCut(header: SessionHeader, inheritedEventCount?: SessionLogOffsetType): SessionLogOffsetType {
  if (header.isSeeded && inheritedEventCount === undefined) {
    throw new Error('seeded session header requires an inherited event count')
  }
  const cut = SessionLogOffset(inheritedEventCount ?? 0)
  if (!header.isSeeded && cut !== 0) {
    throw new Error('unseeded session header inherited event count must be 0')
  }
  return cut
}

/** A validated stored log plus optional torn-tail repair state. */
interface StoredLog {
  readonly meta: SessionHeader
  readonly events: SessionEvent[]
  readonly tornTruncateTo: number | undefined
  readonly inheritedEventCount: SessionLogOffsetType
  readonly revision: PersistenceRevision
}

export interface Config {
  /** PostgreSQL connection string (the session store). */
  url: string
}

/**
 * The PostgreSQL persistence backend. Load as a plugin; it registers as
 * `ctx.sessionPersistence`. Sessions materialize lazily: a created session is
 * visible to this process immediately, reaches the database on its first
 * append or flush, and never existed if the process crashes before that.
 */
export class PgSessionPersistence extends SessionPersistence {
  static Config: z<Config> = z.object({
    url: z.string().required(),
  })

  override readonly name = 'session-persistence-pg'

  private pool!: pg.Pool
  private storeIdentity!: string
  private readonly ready: Promise<void>
  private readonly tracker = new PgBackendTracker(this.name)

  constructor(ctx: Context, public config: Config) {
    super(ctx)
    this.ready = this.openStore(config.url)
    this.tracker.install(ctx, async () => {
      await this.ready.catch(() => undefined)
      await this.pool?.end()
    })
  }

  async create(header: SessionHeader, options?: SessionPersistenceCreateOptions): Promise<SessionHandle> {
    options?.signal?.throwIfAborted()
    const snapshot = materializeCreateHeader(header)
    const inheritedEventCount = assertInheritedCut(snapshot, options?.inheritedEventCount)
    await this.ready
    options?.signal?.throwIfAborted()
    if (this.tracker.hasPending(snapshot.id) || await this.hasStored(snapshot.id)) {
      throw new SessionAlreadyExistsError(snapshot.id)
    }
    options?.signal?.throwIfAborted()
    this.tracker.registerCreated(snapshot, inheritedEventCount)
    const handle = this.tracker.adopt(new PgSessionHandle(this, snapshot.id, snapshot, 'write', {
      cursor: 0,
      materialized: false,
      inheritedEventCount,
    }))
    const seed = options?.parentSource?.events
    if (seed === undefined) return handle
    try {
      if (seed.length === 0) await handle.flush(options)
      else await handle.append(seed, options)
      return handle
    } catch (error: unknown) {
      try {
        await handle.close()
      } catch (closeError: unknown) {
        throw new AggregateError([error, closeError], 'Fork creation and handle cleanup failed')
      }
      throw error
    }
  }

  async open(id: SessionId, access: SessionAccess, options?: SessionPersistenceOpenOptions): Promise<SessionHandle> {
    options?.signal?.throwIfAborted()
    await this.ready
    options?.signal?.throwIfAborted()
    const pending = this.tracker.pendingOf(id)
    if (access === 'read') {
      if (pending !== undefined) {
        return this.tracker.adopt(new PgSessionHandle(this, id, pending.header, 'read', {
          cursor: 0,
          materialized: false,
          inheritedEventCount: pending.inheritedEventCount,
        }))
      }
      const stored = await this.requireStoredLog(id)
      return this.tracker.adopt(new PgSessionHandle(this, id, stored.meta, 'read', {
        cursor: 0,
        materialized: true,
        inheritedEventCount: stored.inheritedEventCount,
      }))
    }
    this.tracker.claimWrite(id)
    let lease: SessionWriteLease | undefined
    try {
      if (!await this.hasStored(id)) throw new SessionPersistenceNotFoundError(id)
      lease = await this.acquireWriteLease({ id } as SessionHeader)
      const stored = await this.requireStoredLog(id)
      return this.tracker.adopt(new PgSessionHandle(this, id, stored.meta, 'write', {
        cursor: stored.events.length,
        materialized: true,
        tornTruncateTo: stored.tornTruncateTo,
        inheritedEventCount: stored.inheritedEventCount,
        primed: stored.events,
      }, lease))
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error))
      let releaseFailure: Error | undefined
      try {
        await lease?.release()
      } catch (raw: unknown) {
        releaseFailure = raw instanceof Error ? raw : new Error(String(raw))
      }
      this.tracker.releaseClaim(id)
      if (releaseFailure !== undefined) {
        throw new AggregateError([failure, releaseFailure], `session "${id}": write open failed and its lock release failed`)
      }
      throw failure
    }
  }

  flush(): Promise<void> {
    return this.tracker.flushAll()
  }

  async stat(
    id: SessionId,
    options?: SessionPersistenceStatOptions,
  ): Promise<SessionPersistenceSnapshot | undefined> {
    options?.signal?.throwIfAborted()
    await this.ready
    options?.signal?.throwIfAborted()
    const pending = this.tracker.pendingOf(id)
    if (pending !== undefined) {
      return { header: pending.header, revision: pending.revision }
    }
    const row = await this.loadSessionRow(id)
    if (row === undefined) return undefined
    return {
      header: rowToMeta(row),
      revision: this.revision(row),
      eventCount: await this.eventCount(id),
    }
  }

  async list(options?: SessionPersistenceListOptions): Promise<readonly SessionPersistenceSnapshot[]> {
    const signal = options?.signal
    await this.ready
    signal?.throwIfAborted()
    const snapshots: SessionPersistenceSnapshot[] = []
    const listed = new Set<SessionId>()
    const pending = [...this.tracker.pendingEntries()]
    const { rows } = await this.pool.query(`SELECT * FROM ${DSH_SCHEMA}.sessions`)
    signal?.throwIfAborted()
    for (const raw of rows) {
      const row = toSessionRow(raw as Record<string, unknown>)
      const header = rowToMeta(row)
      listed.add(header.id)
      snapshots.push({ header, revision: this.revision(row) })
    }
    for (const [id, entry] of pending) {
      if (!listed.has(id)) snapshots.push({ header: entry.header, revision: entry.revision })
    }
    signal?.throwIfAborted()
    return snapshots
  }

  async readStoredLog(_path: string, expectedId: SessionId, signal?: AbortSignal): Promise<SessionHandleReadResult> {
    signal?.throwIfAborted()
    const stored = await this.requireStoredLog(expectedId)
    return { eventState: 'shared-frozen', events: stored.events }
  }

  async resolveLog(id: SessionId, _signal?: AbortSignal): Promise<string | undefined> {
    return await this.hasStored(id) ? id : undefined
  }

  async persistBatch(
    header: SessionHeader,
    events: readonly SessionEvent[],
    isMaterialized: boolean,
    inheritedEventCount: SessionLogOffsetType,
  ): Promise<void> {
    await this.ready
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      if (!isMaterialized) await this.insertSessionRow(client, header, inheritedEventCount)
      for (const event of events) {
        const [surfaceSeqs, surfaceOp, ignorable] = envelopeBindings(event)
        await client.query(
          `INSERT INTO ${DSH_SCHEMA}.events (session_id, seq, type, time, data, source_event_seqs, surface_op, ignorable)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [header.id, event.seq, event.type, event.time, JSON.stringify(event.data), surfaceSeqs, surfaceOp, ignorable],
        )
      }
      if (isMaterialized) {
        await client.query(`UPDATE ${DSH_SCHEMA}.sessions SET revision = revision + 1 WHERE id = $1`, [header.id])
      }
      await client.query('COMMIT')
      if (!isMaterialized) this.tracker.materialized(header.id)
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      if (!isMaterialized && isUniqueViolation(error)) throw new SessionAlreadyExistsError(header.id)
      throw error
    } finally {
      client.release()
    }
  }

  async persistHeader(header: SessionHeader, inheritedEventCount: SessionLogOffsetType): Promise<void> {
    await this.persistBatch(header, [], false, inheritedEventCount)
  }

  async truncateTornTail(header: SessionHeader, truncateTo: number): Promise<void> {
    await this.ready
    await this.pool.query(
      `DELETE FROM ${DSH_SCHEMA}.events WHERE session_id = $1 AND seq >= $2`,
      [header.id, truncateTo],
    )
    await this.pool.query(
      `UPDATE ${DSH_SCHEMA}.sessions SET revision = revision + 1 WHERE id = $1`,
      [header.id],
    )
    this.ctx.logger.warn(`${this.name}: session "${header.id}" recovered from a torn tail; incomplete tail rows were discarded`)
  }

  hasPendingSession(id: SessionId): boolean {
    return this.tracker.hasPending(id)
  }

  releaseHandle(handle: PgSessionHandle, materialized: boolean): void {
    this.tracker.release(handle, materialized)
  }

  async acquireWriteLease(header: SessionHeader): Promise<SessionWriteLease> {
    await this.ready
    const client = await this.pool.connect()
    return SessionWriteLease.acquire(client, header.id)
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

  private async hasStored(id: SessionId): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM ${DSH_SCHEMA}.sessions WHERE id = $1`,
      [id],
    )
    return rows.length > 0
  }

  private async loadSessionRow(id: SessionId): Promise<SessionRow | undefined> {
    const { rows } = await this.pool.query(`SELECT * FROM ${DSH_SCHEMA}.sessions WHERE id = $1`, [id])
    const raw = rows[0] as Record<string, unknown> | undefined
    return raw === undefined ? undefined : toSessionRow(raw)
  }

  private async eventCount(id: SessionId): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ${DSH_SCHEMA}.events WHERE session_id = $1`,
      [id],
    )
    return Number(rows[0]?.n ?? 0)
  }

  private async requireStoredLog(id: SessionId): Promise<StoredLog> {
    const sessionRow = await this.loadSessionRow(id)
    if (sessionRow === undefined) throw new SessionPersistenceNotFoundError(id)
    const meta = rowToMeta(sessionRow)
    assertStoredId(id, meta)
    assertVersion(meta)
    const eventRows = await this.queryEvents(id)
    const { preserved, tornFrom } = scanRows(eventRows)
    validateStoredEvents(meta, preserved)
    freezeStoredEvents(preserved)
    return {
      meta,
      events: preserved,
      tornTruncateTo: tornFrom,
      inheritedEventCount: SessionLogOffset(sessionRow.inherited_event_count),
      revision: this.revision(sessionRow),
    }
  }

  private async insertSessionRow(
    client: pg.PoolClient,
    meta: SessionHeader,
    inheritedEventCount: SessionLogOffsetType,
  ): Promise<void> {
    await client.query(
      `INSERT INTO ${DSH_SCHEMA}.sessions
         (id, version, created_at, cwd, parent_session, is_seeded, inherited_event_count,
          origin, delegation_depth, agent_preset, incarnation, revision)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0)`,
      [
        meta.id, meta.version, meta.createdAt, meta.cwd ?? null, meta.parentSession ?? null,
        meta.isSeeded ? 1 : 0, inheritedEventCount,
        meta.origin ?? null, meta.delegationDepth ?? null, meta.agentPreset ?? null, randomUUID(),
      ],
    )
  }

  private revision(row: SessionRow): PersistenceRevision {
    return SessionPersistenceRevision(
      `${this.storeIdentity}:incarnation:${row.incarnation}:revision:${row.revision}`,
    )
  }

  private async queryEvents(id: SessionId): Promise<EventRow[]> {
    const { rows } = await this.pool.query(
      `SELECT seq, type, time, data, source_event_seqs, surface_op, ignorable
       FROM ${DSH_SCHEMA}.events WHERE session_id = $1 ORDER BY seq`,
      [id],
    )
    return rows.map((r) => toEventRow(r as Record<string, unknown>))
  }
}

export default PgSessionPersistence
