---
description: "从加密的控制面凭据库或密钥 API 解析 DSH 凭据，并按请求查询且支持环境变量回退。"
kind: "package-reference"
---

# @deepseek-ai/dsh-credentials-pg

[English](README.md) | 中文

## 概述

从加密的控制面凭据库行或密钥 API 解析 DSH 凭据，按请求查询并回退到进程环境。

## 目录

- [配置](#config)
- [优先级](#precedence)
- [辅助函数](#helper)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

PostgreSQL 凭据库提供方（平台自有，09 工单 / D20）。它通过 AES-256-GCM 在控制面 `credential_secrets` 表上实现 `ctx.credentials`，也支持 HTTP 解析，使交互容器无需持有凭据库主密钥。凭据库优先于进程环境，因此管理员轮换后，下一次 `resolve` 即生效。系统不会缓存值。

> **归属：** 这是平台自有提供方，由本仓库维护，不属于上游 DSH。

<a id="config"></a>
## 配置

可信 worker（直接通过 PG 解密）：

```yaml
- id: credentials-pg
  name: '@deepseek-ai/dsh-credentials-pg'
  config:
    url: !!js process.env.DATABASE_URL ?? process.env.PG_DSN ?? ''
    masterKey: !!js process.env.SECRETS_MASTER_KEY ?? process.env.CP_JWT_SECRET ?? ''
```

交互容器（HTTP；不持有主密钥）：

```yaml
- id: credentials-pg
  name: '@deepseek-ai/dsh-credentials-pg'
  config:
    url: !!js process.env.DATABASE_URL ?? process.env.PG_DSN ?? ''
    masterKey: !!js process.env.SECRETS_MASTER_KEY ?? process.env.CP_JWT_SECRET ?? ''
    resolveUrl: !!js process.env.CP_SECRETS_URL ?? ''
    token: !!js process.env.CP_SECRETS_TOKEN ?? ''
```

`resolveUrl` 非空时会选择 HTTP 模式，并忽略 `url` / `masterKey`。

| 字段 | 含义 |
|---|---|
| `url` | PostgreSQL 连接字符串，或用于进程内测试的字面值 `memory:` |
| `masterKey` | 凭据库主密钥（`SECRETS_MASTER_KEY`，本地回退值为 `CP_JWT_SECRET`） |
| `resolveUrl` | 控制面基址，例如 `http://127.0.0.1:4000/api/internal/secrets` |
| `token` | 作用域为 `secrets:resolve` 的 `X-API-Key`（`CP_SECRETS_TOKEN`） |

在平台组合中用此提供方替换 `dsh-credentials-local`。不要将 `DEEPSEEK_API_KEY` 注入运行时环境：适配器会在每次请求前通过此提供方解析 `apiKeyEnv`。

<a id="precedence"></a>
## 优先级

| 层 | 来源 id | 可写 |
|---|---|---|
| 控制面凭据库（PG 行或 HTTP） | `vault` | PG 可写（`set` / `unset`）；HTTP 不可写（仅限管理 API） |
| 进程环境 | `env` | 可写（写入凭据库的值会覆盖环境值） |

空的存储值或环境变量值按不存在处理（seam 级规则）。`describe()` 不会包含机密值。

<a id="helper"></a>
## 辅助函数

`lookupSecret(query, masterKey, ref)` 为已持有 PG pool 的调用方解密一行凭据（task-worker MCP 环境注入）。

<a id="model-experience"></a>
## 模型体验

此体验由消费方 LLM 适配器间接提供：存储值为其模型请求授权，适配器拥有所有面向模型的接口面。

#### KV Cache 影响

没有直接失效路径；凭据不会进入请求前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办工作

- **容器 DNS** — `CP_SECRETS_URL` 默认值为 `http://127.0.0.1:<CP_PORT>/api/internal/secrets`；podman/docker 需要可从宿主机访问的 URL，例如 `http://host.containers.internal:4000/api/internal/secrets`
- **测试 `memory:` URL** — 内存模式仅供单元测试；未提供 PostgreSQL `url` 时，Provider 会在构造阶段明确报错（仅 PG 模式）

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
