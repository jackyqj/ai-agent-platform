# 逻辑 RPC 会话（方案 A · 第一刀）

Status: accepted (awaiting implementation)  
Date: 2026-08-27  
Decision: **D22** — 产品运行时是 JSON-RPC 任务池；员工 `POST /sessions` 只建逻辑会话，不拉 DSH Web 实例。  
Supersedes in part: spec ADR-1 / map D1（交互 = 每用户 Web 实例）。Web 实例降为可选「工作室」，本轮不实现工作室入口。

关联：架构评审方案 A；`SessionsService.create`；Worker `resolveDshSessionId`；商店 `startChat`。

## 1. 问题

商店对话已经走 `submitTask` → BullMQ → Worker。Worker 用商店 `sessionId` 作为 DSH `session_id` 跨轮复用。

控制面仍在 `create()` 里 `getOrCreateWebInstance`。前端从不请求 `/proxy`。结果是：开一次对话就占一份实例配额，代理通道空转，创建失败文案还在说「实例」。

## 2. 目标

员工点「开始对话」得到一条可绑任务的会话行，**不启动容器、不占 `maxConcurrentInstances`**。关会话只改状态，没有实例可回收。

存量 `type=web` 且带 `instanceId` 的行：关闭时仍 `stop` 该实例（一次性收口旧数据）。

## 3. 非目标（本轮不做）

- SSE / 流式 token / 工具步骤 UI
- 历史改读 DSH 事件链（仍从 `tasks` 拼 transcript）
- developer 工作室（按需开 Web 实例）
- 删除编排器、`/proxy`、`routing_secret` 列、`webInstanceEnv`
- 钉钉 / cron / 内部 API 绑商店会话（继续一次性任务）
- 网关配额、D18 路由守卫

## 4. 会话模型

| 字段 | 本轮新行 | 说明 |
|---|---|---|
| `type` | `rpc` | 表已允许 `web \| rpc`；新行不再写 `web` |
| `instanceId` | `null` | 可空列，无需迁移 |
| `routingSecret` | 仍生成 UUID | 列 `NOT NULL`；本轮不消费。工作室以后再用 |
| `status` | `active` | 不变 |
| `agentPresetId` | 请求体 | 不变；`startChat` 仍按 preset 复用未关闭会话 |

权限模式：控制器继续 `policies.resolve(role, dept)`，写入 `session.create` 审计 payload。不再注入容器 env。任务执行时的 `permissionMode` 仍由 `TasksService.submit` **按任务提交者**解析，与会话创建时的解析独立。本轮商店路径创建者即提交者，两处一致。不保证「他人向某 `sessionId` 提交」时与建会话时的 mode 相同。

## 5. 行为

**创建**（`SessionsService.create`）

1. 组装会话对象：`type: 'rpc'`，无 `instanceId`，生成 `routingSecret`。
2. 写入 PG（或内存回退）。
3. 审计 `session.create`（含 `agentPresetId`、`permissionMode`）。
4. **不**调用 `InstancesService.getOrCreateWebInstance`。

**关闭**（`close` / `closeAllForUser` / 禁用用户）

- 无 `instanceId`：只标 `closed`。
- 有 `instanceId`（旧 web 行）：标 `closed` 并 `instances.stop`。

**代理**（`GET /proxy/:sessionId/*`）

- 新会话没有实例 → 已有 `503 no instance`。员工路径不走代理，可接受。
- 不删代理。

**任务**

- `POST /tasks` 仍校验 `sessionId` 归属且未关闭。Worker 侧 `resolveDshSessionId` 已复用该 id。不改 Worker。

## 6. API

`POST /api/sessions` 响应形状不变：`{ sessionId, routingSecret, agentPresetId, permissionMode }`。避免客户端契约抖动。`routingSecret` 仍不在 UI 展示。

创建失败不再归因于实例。商店 `startChat` 失败文案改为「会话创建失败，请稍后重试」。测试从「实例还没起来」改跟这条文案。

## 7. 代码与文档

- `SessionsService.create`：去掉 `getOrCreateWebInstance` 与 `webInstanceEnv(...)`。删除 `sessions.service.ts` 对 `webInstanceEnv` 的导入。`web-instance-env.ts` **文件保留**（非目标：不删该模块；工作室以后仍用）。
- `docs/map.md`：新增 D22；D1 注明被 D22 修正（员工路径）。
- `docs/spec.md`（读者仍会把「每用户 Web 实例」当交互主路径的位置，各加一句「D22：员工路径走运行时池；S1/Web 实例为远期工作室」）：
  - ADR-1 决策段
  - §3 mermaid 图下（S1/S2 节点）
  - §3.1 执行层 bullet（约「交互式会话跑在每用户 DSH Web 实例」）
  - Phase 1 checklist「容器化 DSH Web 实例懒启动 + 空闲回收」
- `sessions.service.ts` 模块注释与 `create` 注释对齐本 spec。

不改 `enterprise-shell` 全文拓扑。员工路径行为以本 spec 为准；`spec.md` 上列位置必须不再与 D22 打架。

## 8. 测试

`apps/control-plane/src/sessions/sessions.service.test.ts`：

- **主信号：** `create` 返回 `type === 'rpc'` 且 `instanceId === undefined`。`instances.list()` 为空是辅信号（防回归 spawn），单独不足以证明插入成功。
- `closeAllForUser`：会话变为 `closed`；全过程无实例。
- **回收分支：** 不新增写入 API。`create` 返回的会话对象在内存回退下与内部 Map 同源。测试先 `instances.getOrCreateWebInstance`，再把该 `id` 赋给返回对象的 `instanceId`，然后 `close`。断言该实例从 `instances.list()` 消失。覆盖 `if (s.instanceId) stop`，避免存量/工作室收口腐烂。
- 删除「create 必然产生实例」的旧断言。

`web/store/src/App.test.tsx`：`createSession` 抛错时断言文案「会话创建失败，请稍后重试」，不再提实例。

`tasks.service.test.ts` 继续用 `sessions.create` 取 `sessionId`，不依赖实例。

## 9. 错误与容量

- 创建会话失败：PG/磁盘类错误原样抛出；不再有 `instance capacity exceeded` 来自员工开对话。
- `maxConcurrentInstances` 只约束日后显式 spawn 工作室实例。本轮员工路径与该上限解耦。

## 10. 验收

1. `sessions.create` 得到 `type === 'rpc'` 且无 `instanceId`；`instances.list()` 为空。
2. 商店开对话不再出现「实例还没起来」。
3. `POST /tasks` 带新 `sessionId` 仍能入队（现有任务测试不破）。
4. map D22 已写；`spec.md` 上列四处与 D22 对齐。
5. 带 `instanceId` 的会话 `close` 后实例从 `list()` 消失。
