# @deepseek-ai/dsh-session-persistence-pg

PostgreSQL 会话持久化后端（平台自有，08 工单）。将每个会话头与事件映射为专用 `dsh_sessions` schema 中的行，写路径编排委托给 `PersistenceCoordinator`——与 SQLite/JSONL 后端相同的崩溃收尾、seq 连续性、事务原子性契约（移植自 `dsh-session-persistence-sqlite`）。

> **定位声明**：平台自有 Provider，非上游仓库提交物。测试通过仓库共享契约 + 协调器契约，**覆盖率已达上游逐文件 100% 门禁（71/71，4 指标全 100%）**；剩余上游门禁项（doc-sync、双语 README、Agent Note）待「是否贡献上游」决策后补齐。

## 配置

```yaml
- id: session-persistence-pg
  name: '@deepseek-ai/dsh-session-persistence-pg'
  config:
    url: postgres://user:pass@host:5432/db   # 会话存储连接串
```

替换 JSONL 时禁用原行（公司 profile 的 cordis.patch.yml 已示范）：

```yaml
- id: session-persistence-jsonl
  disabled: true
```

## 存储布局

- 专用 schema `dsh_sessions`（不污染平台元数据表）
- `persistence_state`：单行 store identity（服务端限定 revision 来源）
- `sessions`：会话头元数据 + `incarnation`/`revision`（monotonic log-change token）
- `events`：事件 1:1 行（`data` 为 JSON 文本，主键 `(session_id, seq)`）

## 语义保证（与 SQLite/JSONL 一致）

- **append-only**：崩溃尾部以"最后 `turn/end` 之后的空洞/坏行"界定，`load` 平衡、`prepare` 物理修复
- **seq 连续**：committed 区域空洞/坏行拒绝（`scanRows` 契约）
- **事务原子**：`appendBatch`/`commitRepair` 各为单一 PG 事务，中途失败整体回滚
- **懒物化**：会话行由首次 append 写入；无 append 的会话不在 `list`
- **seek 读**：`readFrom` 直接 SQL `seq >= from`，不重扫全表

## 测试

```sh
DATABASE_URL=postgres://.../dsh_pg_test pnpm vitest run packages/session/session-persistence-pg
```

**71 个测试（2025-08-18 全绿）**：仓库共享的持久化契约 + 协调器契约 + 聚焦测试 + 边界覆盖（config 回退/空值/委托/错误路径/约束冲突）。**覆盖率 100% × 4 指标（行/分支/函数/语句）× 2 文件**——已达上游逐文件 100% 门禁。运行需 `--fileParallelism=false`（单测试库避免文件间表竞争）。

## Model Experience

#### 对模型可见性

间接：后端本身不注入任何提示词、工具或会话事件；模型看到的是由组装其 cordis 的插件决定的内容。持久化只决定会话如何存续。

#### Token 效应

无直接贡献；事件经本后端序列化为行，不产生额外模型 token。

#### KV Cache 效应

无直接影响；会话前缀由请求组装方决定，本后端不修改请求。

## Known Limitations and Deferred Work

- **测试需顺序执行**：单测试库共享（`dsh_pg_test`），两个 spec 文件须 `--fileParallelism=false`；破坏性测试（DROP/约束冲突）依赖 beforeEach 的 CASCADE 清理恢复
- **无迁移策略**：`SCHEMA_VERSION=1` 起步，DDL 变更需显式迁移（当前 `CREATE TABLE IF NOT EXISTS` 幂等，不含版本迁移）
- **无连接池调优**：使用 `pg.Pool` 默认参数；高并发会话数下需评估 `max`/`idleTimeoutMillis`
- **无 TLS/鉴权集成**：连接串内嵌凭据（生产经 D20 密钥服务注入，配置零秘密）
- 平台自有定位：双语 README、doc-sync、invariant 门禁待团队决策后补齐
