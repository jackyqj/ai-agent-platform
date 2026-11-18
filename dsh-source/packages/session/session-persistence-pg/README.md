# @deepseek-ai/dsh-session-persistence-pg

PostgreSQL session persistence backend (platform-owned, 08 工单). Maps each session header and event to rows in a dedicated `dsh_sessions` schema and serves the handle-based `SessionPersistence` API (`create`/`open` return `SessionHandle`).

> **定位声明**：平台自有 Provider，非上游仓库提交物。

## Config

```yaml
- id: session-persistence-pg
  name: '@deepseek-ai/dsh-session-persistence-pg'
  config:
    url: postgres://user:pass@host:5432/db
```

Replace JSONL by disabling the original row (the company profile's cordis.patch.yml already does this):

```yaml
- id: session-persistence-jsonl
  disabled: true
```

## Storage layout

- Dedicated schema `dsh_sessions`
- `persistence_state`: singleton store identity
- `sessions`: header metadata + `incarnation`/`revision` + `inherited_event_count`
- `events`: one row per event (`data` is JSON text, primary key `(session_id, seq)`)

## Semantics

- **append-only** through `SessionHandle.append`; `flush` is the durability barrier
- **lazy materialization**: a created session is visible in-process immediately and reaches PostgreSQL on the first append or flush
- **torn tail**: rows after the last `turn/end` that fail to parse are discarded by the write path
- **single writer**: in-process claim plus a PostgreSQL advisory lock

## Tests

```sh
DATABASE_URL=postgres://.../dsh_pg_test pnpm vitest run packages/session/session-persistence-pg --fileParallelism=false
```

## Model Experience

Indirectly, through the consuming agent loop: this backend stores and restores the event log, and the loop owns every model-visible surface.

#### KV Cache effect

No direct invalidation; persistence does not mutate a live request prefix.

## Known Limitations and Deferred Work

- Tests share one database and need `--fileParallelism=false`
- `SCHEMA_VERSION=2` has no automated migration from v1 (`seed_length` rows)
- Default `pg.Pool` settings; tune `max` under high session concurrency
- Connection strings carry credentials (inject via D20 in production)
