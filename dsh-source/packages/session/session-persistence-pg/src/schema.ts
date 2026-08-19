/**
 * Schema + load-time helpers for the PostgreSQL session-persistence backend:
 * a dedicated `dsh_sessions` schema with `sessions` metadata and a 1:1 `events`
 * row per {@link SessionEvent}, mirroring the SQLite backend's crash-tail-on-load
 * semantics (the `scanRows` cut).
 *
 * Ported from dsh-session-persistence-sqlite (platform-owned, 08 工单).
 * @module dsh-session-persistence-pg/schema
 */

import type { SessionEvent, SessionId, SessionHeader, SurfaceOp } from '@deepseek-ai/dsh-session'

/** PG schema version gate; bump on a breaking table-layout change. */
export const SCHEMA_VERSION = 1

/** Dedicated schema keeps DSH session data out of the control-plane tables. */
export const DSH_SCHEMA = 'dsh_sessions'

export interface SessionRow {
  id: string
  version: number
  created_at: number
  cwd: string | null
  parent_session: string | null
  seed_length: number | null
  origin: 'subagent' | null
  incarnation: string
  revision: number
  delegation_depth: number | null
  agent_preset: string | null
}

export interface EventRow {
  seq: number
  type: string
  time: number
  data: string
  source_event_seqs: string | null
  surface_op: string | null
  ignorable: number | null
}

export const DDL = `
  CREATE SCHEMA IF NOT EXISTS ${DSH_SCHEMA};

  CREATE TABLE IF NOT EXISTS ${DSH_SCHEMA}.persistence_state (
    singleton integer PRIMARY KEY CHECK (singleton = 1),
    store_id  text NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ${DSH_SCHEMA}.sessions (
    id               text PRIMARY KEY,
    version          integer NOT NULL,
    created_at       bigint NOT NULL,
    cwd              text,
    parent_session   text,
    seed_length      integer,
    origin           text,
    delegation_depth integer,
    agent_preset     text,
    incarnation      text NOT NULL,
    revision         bigint NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ${DSH_SCHEMA}.events (
    session_id        text NOT NULL REFERENCES ${DSH_SCHEMA}.sessions(id) ON DELETE CASCADE,
    seq               bigint NOT NULL,
    type              text NOT NULL,
    time              bigint NOT NULL,
    data              text NOT NULL,
    source_event_seqs text,
    surface_op        text,
    ignorable         integer,
    PRIMARY KEY (session_id, seq)
  );
`

/**
 * Reconstruct the {@link SessionHeader} from a `sessions` row. PG returns
 * `bigint` as string; callers pass already-parsed numbers.
 */
export function rowToMeta(row: SessionRow): SessionHeader {
  if (!Number.isSafeInteger(row.created_at) || row.created_at < 0) {
    throw new Error('stored session createdAt must be a non-negative safe integer')
  }
  return {
    version: row.version,
    id: row.id as SessionId,
    createdAt: row.created_at,
    ...row.cwd !== null ? { cwd: row.cwd } : {},
    ...row.parent_session !== null ? { parentSession: row.parent_session as SessionId } : {},
    ...row.seed_length !== null ? { seedLength: row.seed_length } : {},
    ...row.origin !== null ? { origin: row.origin } : {},
    ...row.delegation_depth !== null ? { delegationDepth: row.delegation_depth } : {},
    ...row.agent_preset !== null ? { agentPreset: row.agent_preset } : {},
  }
}

export function rowToEvent(row: EventRow): SessionEvent {
  const surfaceFields = {
    ...row.source_event_seqs !== null ? { sourceEventSeqs: JSON.parse(row.source_event_seqs) as number[] } : {},
    ...row.surface_op !== null ? { surfaceOp: JSON.parse(row.surface_op) as SurfaceOp } : {},
  }
  const ignorableField = row.ignorable === 1 ? { ignorable: true as const } : {}
  return {
    type: row.type as SessionEvent['type'],
    seq: row.seq,
    time: row.time,
    data: JSON.parse(row.data) as SessionEvent['data'],
    ...surfaceFields,
    ...ignorableField,
  } as SessionEvent
}

/**
 * Preserve the contiguous committed prefix; a hole or seq gap after the last
 * `turn/end` marks a tolerated torn tail. Same contract as the SQLite backend.
 */
export function scanRows(rows: readonly EventRow[], base = 0): { preserved: SessionEvent[]; tornFrom?: number } {
  interface Parsed { ok: boolean; event?: SessionEvent }
  const parsed: Parsed[] = rows.map((row) => {
    try {
      return { ok: true, event: rowToEvent(row) }
    } catch {
      return { ok: false }
    }
  })

  let lastTurnEnd = -1
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i]?.ok && rows[i]?.type === 'turn/end') {
      lastTurnEnd = i
      break
    }
  }

  const preserved: SessionEvent[] = []
  for (let i = 0; i < rows.length; i++) {
    const p = parsed[i]
    if (!p?.ok || p.event === undefined) {
      if (i <= lastTurnEnd) throw new Error(`corrupt session log: unparsable committed event at seq ${rows[i]?.seq}`)
      break
    }
    if (p.event.seq !== base + i) {
      if (i <= lastTurnEnd) throw new Error(`corrupt session log: seq gap in committed region (expected ${base + i}, got ${p.event.seq})`)
      break
    }
    preserved.push(p.event)
  }
  return preserved.length < rows.length ? { preserved, tornFrom: base + preserved.length } : { preserved }
}

/** Map a pg row (bigint-as-string) to a typed SessionRow. */
export function toSessionRow(raw: Record<string, unknown>): SessionRow {
  return {
    id: String(raw.id),
    version: Number(raw.version),
    created_at: Number(raw.created_at),
    cwd: raw.cwd == null ? null : String(raw.cwd),
    parent_session: raw.parent_session == null ? null : String(raw.parent_session),
    seed_length: raw.seed_length == null ? null : Number(raw.seed_length),
    origin: raw.origin as SessionRow['origin'],
    incarnation: String(raw.incarnation),
    revision: Number(raw.revision),
    delegation_depth: raw.delegation_depth == null ? null : Number(raw.delegation_depth),
    agent_preset: raw.agent_preset == null ? null : String(raw.agent_preset),
  }
}

export function toEventRow(raw: Record<string, unknown>): EventRow {
  return {
    seq: Number(raw.seq),
    type: String(raw.type),
    time: Number(raw.time),
    data: String(raw.data),
    source_event_seqs: raw.source_event_seqs == null ? null : String(raw.source_event_seqs),
    surface_op: raw.surface_op == null ? null : String(raw.surface_op),
    ignorable: raw.ignorable == null ? null : Number(raw.ignorable),
  }
}
