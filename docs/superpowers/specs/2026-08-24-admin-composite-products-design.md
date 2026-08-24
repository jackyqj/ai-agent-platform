# 管理员上架的组合产品（Option A）

Status: implemented (P0–P3)  
Date: 2026-08-24  
Audience: **管理员/开发者编排并发布；员工只选用、不能改图**（不包含业务人员自助拖拽）。

关联：`docs/agent-orchestration-design.md`（单 Agent）· 工单 12/14/21 · MCP `kb`/`db`

## 1. 问题

商店现在只有单 Agent 定义（persona / 模型 / MCP 勾选）。没有：

- 可运营的 **WebAPI / 数据库连接器** 目录
- **多智能体图**（谁先谁后）
- 把已登记工具当作图上的确定性节点

员工侧必须保持商店语义：只看见已发布产品，点一下就跑。

## 2. 三件套

| 对象 | 谁写 | 员工看见 | 运行时 |
|---|---|---|---|
| **连接器** | admin | 否 | 密钥只在 vault（`secretRef`）；DSN / Bearer 不进 YAML |
| **工具** | admin/developer 草稿，admin 发布 | 否（只作为图节点） | HTTP 白名单 path；PG 只读 + 表白名单 |
| **图** | developer 编草稿，admin 发布 | 已发布 + 可见性过滤 | 控制面 DAG：Agent 节点走任务队列；Tool 节点不经模型 |

单 Agent 仍走现有 `AgentSpec` 编译器。图 **引用** 已发布 Agent，不重新编译 preset。

## 3. 图节点（v1）

- `agent`：`agentPresetId` + `promptTemplate`（`{{input.*}}` / `{{nodes.<id>.output}}`）
- `tool`：`toolId` + `argsTemplate`（同上插值；HTTP 不得改 Base URL）
- `gate`：`when` 插值后为字符串 `true` 才继续后继，否则跳过后继（本节点成功但 `ok=false`）

边：`from → to`。必须是 DAG。无入边的节点并行启动。图级 `onError`：`stop`（默认）或 `continue`。

非目标：循环、子图、员工改图、任意 URL 的 HTTP 节点、模型现场写 `workflow` JS 作为真源。

## 4. 权限

| 权限点 | 预置角色 |
|---|---|
| `connector.manage` | admin |
| `graph.edit` | developer, admin |
| `graph.publish` | admin |

员工：`GET /graphs`、`POST /graphs/:id/run`（仅已发布且可见）。

## 5. 安全

- HTTP：`baseUrl` 在连接器上写死；工具只填 `method` + `pathTemplate`；插值后 path 必须仍以 `/` 开头且不含 `..`
- PG：对齐 `mcp-db`（只读事务、SELECT-only、表白名单、LIMIT）
- 密钥：连接器只存 `secretRef`；列表 API 永不回明文
- 审批：Agent 节点仍走该 preset 的 14 工单门；若待审批，该步记 `awaitingApproval` 并停止后续（`stop`）

## 6. 与现网 MCP 的关系

host 上的 `mcp-kb` / `mcp-db` **继续**给单 Agent 勾选。本目录是平台侧的第二通道：给 **图的 Tool 节点** 和管理员登记多条连接用。不在 v1 把每条连接器再挂一份 `dsh-mcp-client`（`serverName` 进程内唯一）。

## 7. UI

- 商店：已发布图卡片 + 一段输入 + 运行 + 步骤结果
- 管理配置页：连接器 / 工具列表；图用 **GraphComposeView**（列表 / React Flow 画布 / 试跑 / 修订），JSON 仅「高级」折叠

## 8. 图编排分期（本轮已交付）

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | `GraphComposeView` 步骤列表；配置页 textarea 退役 | done |
| P1 | `POST /admin/graphs/:id/trial` 试跑工作副本 | done |
| P2 | React Flow 画布；列表/画布切换；连线写入 `edges`（拒环）；坐标可持久化 | done |
| P3 | `graph_revisions` + 回滚；发布连接器/图前校验 `secretRef` 已配置 | done |
