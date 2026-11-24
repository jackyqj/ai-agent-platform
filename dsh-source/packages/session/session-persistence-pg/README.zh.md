---
description: "在 PostgreSQL 中保存 DSH Session 历史，并通过基于句柄的持久化 API 重新打开。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-persistence-pg

[English](README.md) | 中文

## 概述

通过基于句柄的持久化 API 在 PostgreSQL 中保存和重新打开 DSH Session 历史。需要显式选择此 Provider；旧 Session 格式对应的 PG 行会保留，但无法打开。

## 目录

- [配置](#config)
- [存储布局](#storage-layout)
- [语义](#semantics)
- [测试](#tests)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

PostgreSQL 会话持久化后端（平台自有，08 工单）。它将每个会话的头信息和事件映射为专用 `dsh_sessions` schema 中的行，并提供基于 handle 的 `SessionPersistence` API（`create` / `open` 返回 `SessionHandle`）。

> **归属：** 这是平台自有 Provider，由本仓库维护，不属于上游 DSH。

<a id="config"></a>
## 配置

```yaml
- id: session-persistence-pg
  name: '@deepseek-ai/dsh-session-persistence-pg'
  config:
    url: postgres://user:pass@host:5432/db
```

通过禁用原始 row 来替换 JSONL（公司 profile 的 `cordis.patch.yml` 已这样配置）：

```yaml
- id: session-persistence-jsonl
  disabled: true
```

<a id="storage-layout"></a>
## 存储布局

- 专用 schema `dsh_sessions`
- `persistence_state`：单例存储标识
- `sessions`：头信息元数据、`incarnation` / `revision` 和 `inherited_event_count`
- `events`：每个事件一行（`data` 为 JSON 文本，主键为 `(session_id, seq)`）

<a id="semantics"></a>
## 语义

- **仅追加**：通过 `SessionHandle.append` 追加；`flush` 是持久性屏障
- **延迟实体化**：创建的会话会立即在进程内可见，并在首次 append 或 flush 时写入 PostgreSQL
- **fork 历史**：`create(parentSource)` 在返回前复制完整的子日志；空来源通过 `flush` 实体化
- **读取所有权**：`read()` 返回 `{ eventState, events }`；存储事件经过深度冻结，空的待处理读取为 detached
- **撕裂尾部**：写入路径会丢弃最后一个 `turn/end` 之后无法解析的行
- **单写者**：使用进程内认领与 PostgreSQL advisory lock
- **关闭**：后端先排空仍打开的写句柄，再关闭 PostgreSQL pool

<a id="tests"></a>
## 测试

```sh
DATABASE_URL=postgres://.../dsh_pg_test pnpm vitest run packages/session/session-persistence-pg --fileParallelism=false
```

<a id="model-experience"></a>
## 模型体验

由消费方 agent loop 间接提供：此后端存储并恢复事件日志，agent loop 负责所有面向模型的接口面。

#### KV Cache 影响

没有直接失效路径；持久化不会修改实时请求前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办工作

- 测试共用一个数据库，需要设置 `--fileParallelism=false`
- `SCHEMA_VERSION=2` 不会自动迁移含 `seed_length` 的 v1 行
- Provider 仅接受当前 DSH Session 格式，不迁移旧 PG 日志；不兼容行会保留并在打开时被拒绝。JSONL Provider 负责已发布格式的历史迁移路径。
- 使用 `pg.Pool` 默认设置；高会话并发时应调整 `max`
- 连接字符串包含凭据（生产环境通过 D20 注入）

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
