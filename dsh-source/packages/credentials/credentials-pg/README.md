# @deepseek-ai/dsh-credentials-pg

PostgreSQL credential vault provider (platform-owned, 09 工单 / D20). Implements `ctx.credentials` over the control-plane `credential_secrets` table (AES-256-GCM), or over HTTP resolve so interactive containers never hold the vault master key. Vault wins over the process environment so an admin rotation reaches the next `resolve` without restarting the runtime. Values are never cached.

> **定位声明**：平台自有 Provider，非上游仓库提交物。剩余上游门禁项（doc-sync、双语 README、Agent Note）待「是否贡献上游」决策后补齐。

## Config

Trusted worker (direct PG decrypt):

```yaml
- id: credentials-pg
  name: '@deepseek-ai/dsh-credentials-pg'
  config:
    url: !!js process.env.DATABASE_URL ?? process.env.PG_DSN ?? ''
    masterKey: !!js process.env.SECRETS_MASTER_KEY ?? process.env.CP_JWT_SECRET ?? ''
```

Interactive container (HTTP; no master key):

```yaml
- id: credentials-pg
  name: '@deepseek-ai/dsh-credentials-pg'
  config:
    url: !!js process.env.DATABASE_URL ?? process.env.PG_DSN ?? ''
    masterKey: !!js process.env.SECRETS_MASTER_KEY ?? process.env.CP_JWT_SECRET ?? ''
    resolveUrl: !!js process.env.CP_SECRETS_URL ?? ''
    token: !!js process.env.CP_SECRETS_TOKEN ?? ''
```

`resolveUrl` non-empty selects HTTP and ignores `url`/`masterKey`.

| Field | Meaning |
|---|---|
| `url` | PostgreSQL connection string, or the literal `memory:` for in-process tests |
| `masterKey` | Vault master secret (`SECRETS_MASTER_KEY`, local fallback `CP_JWT_SECRET`) |
| `resolveUrl` | Control-plane base, e.g. `http://127.0.0.1:4000/api/internal/secrets` |
| `token` | `X-API-Key` with scope `secrets:resolve` (`CP_SECRETS_TOKEN`) |

Replace `dsh-credentials-local` in platform compositions. Do not inject `DEEPSEEK_API_KEY` into the runtime environment: the adapter resolves `apiKeyEnv` per request through this provider.

## Precedence

| Layer | Source id | Writable |
|---|---|---|
| Control-plane vault (PG row or HTTP) | `vault` | PG yes (`set`/`unset`); HTTP no (admin API only) |
| Process environment | `env` | yes (a vault write shadows it) |

An empty stored or environment value is absent (seam-wide rule). `describe()` never includes the secret.

## Helper

`lookupSecret(query, masterKey, ref)` decrypts one row for callers that already hold a PG pool (task-worker MCP env injection).

## Model Experience

Indirectly, through the consuming LLM adapters: stored values authorize their provider requests, and the adapter owns every model-visible surface.

#### KV Cache effect

No direct invalidation; credentials never enter a request prefix.

## Known Limitations and Deferred Work

- **Container DNS** — `CP_SECRETS_URL` defaults to `http://127.0.0.1:<CP_PORT>/api/internal/secrets`; podman/docker needs a host-reachable URL such as `http://host.containers.internal:4000/api/internal/secrets`
- **Test `memory:` URL** — in-memory mode is for unit tests; a missing postgres `url` fails loud at construction (PG mode only)
- 平台自有定位：双语 README、doc-sync 待团队决策后补齐
