---
description: "Store DSH Session histories in PostgreSQL and reopen them through the handle-based persistence API."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-persistence-pg

English | [中文](README.zh.md)

## Summary

Store and reopen DSH Session histories in PostgreSQL through the handle-based persistence API. Select this provider explicitly; existing PG rows from older Session formats remain preserved but cannot be opened.

## Table of Contents

- [Config](#config)
- [Storage layout](#storage-layout)
- [Semantics](#semantics)
- [Tests](#tests)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

PostgreSQL session persistence backend (platform-owned, 08 工单). Maps each session header and event to rows in a dedicated `dsh_sessions` schema and serves the handle-based `SessionPersistence` API (`create`/`open` return `SessionHandle`).

> **Ownership:** This is a platform-owned provider, maintained in this repository rather than upstream DSH.

<a id="config"></a>
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

<a id="storage-layout"></a>
## Storage layout

- Dedicated schema `dsh_sessions`
- `persistence_state`: singleton store identity
- `sessions`: header metadata + `incarnation`/`revision` + `inherited_event_count`
- `events`: one row per event (`data` is JSON text, primary key `(session_id, seq)`)

<a id="semantics"></a>
## Semantics

- **append-only** through `SessionHandle.append`; `flush` is the durability barrier
- **lazy materialization**: a created session is visible in-process immediately and reaches PostgreSQL on the first append or flush
- **fork history**: `create(parentSource)` copies the complete child log before resolving; an empty source is materialized by `flush`
- **read ownership**: `read()` returns `{ eventState, events }`; stored events are deeply frozen and empty pending reads are detached
- **torn tail**: rows after the last `turn/end` that fail to parse are discarded by the write path
- **single writer**: in-process claim plus a PostgreSQL advisory lock
- **shutdown**: backend teardown drains open write handles before closing the PostgreSQL pool

<a id="tests"></a>
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
- The provider accepts only the current DSH Session format and does not migrate older PG logs; incompatible rows are preserved and refused on open. The JSONL provider owns the shipped historical-format migration path.
- Default `pg.Pool` settings; tune `max` under high session concurrency
- Connection strings carry credentials (inject via D20 in production)

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
