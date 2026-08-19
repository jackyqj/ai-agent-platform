# 19 JSON-RPC 运行时池与任务队列

Status: open
Type: task
Phase: Phase 3 — 知识库与自动化（第 11–14 周）
Blocked by: 06, 08

## 背景

spec ADR-1：自动化任务跑在 JSON-RPC 运行时池——常驻 DSH 运行时进程，控制面统一调度；`harness.run(task, session_id)` 复用会话与持久 shell，`session_root` 指向共享存储。驱动方式已定：控制面为 Node/TS，使用官方 **TS SDK `@deepseek-ai/dsh-sdk-client`**（与 Python SDK 同协议：子进程 + JSON-RPC over stdio；Python SDK 保留为脚本/备选）。设计详见 enterprise-shell §3.4/§3.9。06 已预留接口。

## 目标

自动化执行引擎：IM 触发、定时触发、API 触发的任务被可靠执行、可观测、可重试。

## 交付物

- [ ] 运行时池：N 个常驻 DSH 运行时进程，任务队列 Redis + BullMQ（优先级/超时/重试）
- [ ] 任务模型：任务 → 会话/session_id → 结果/失败原因/执行轨迹（shell §4 `tasks` 表）
- [ ] 并发控制与资源上限（配合 16）
- [ ] 服务身份触发入口：API Key 鉴权 + scope 校验（配合 07）
- [ ] 结果回调：完成/失败通知（IM、Web 任务中心、API webhook）
- [ ] 任务可观测：执行状态、日志、审计（配合 15）
- [ ] 与 06 控制面打通：IM/定时/API 统一入口

## 验收标准

- [ ] 同用户任务串行（会话隔离），跨用户互不影响
- [ ] 任务崩溃自动重试（幂等策略），可人工取消
- [ ] 每个任务可回溯完整执行链

## Comments

> 2025-08-18：**队列闭环完成并端到端实测**。
> - 控制面：`src/tasks/`（生产端）——BullMQ 队列 + tasks 表（PG，002 迁移）+ `POST /api/service/trigger`（API Key + scope=task:create）
> - Worker 独立进程：`dsh-source/packages/platform/task-worker/`——TS SDK（`@deepseek-ai/dsh-sdk-client`）拉起 `dsh-jsonrpc-agent` bin + `worker.cordis.yml`（公司 persona/知识库 MCP/NVIDIA 模型）
> - 实测：API key 触发「查报销餐费上限」→ queued → worker 执行 → done（模型答出加班餐补 80 元等）；审计链 task.triggered → submitted → completed 齐全
> - 踩坑：pnpm allowBuilds 策略需批 `msgpackr-extract: false`（pnpm-workspace.yaml 已加）；SDK env 在 launch 内传
>
> 2025-08-18：**可靠性批完成，全部实测**（`src/worker.ts`）：
> - **崩溃重试**：job 级 attempts=3 + 指数退避（queue.add 显式传，Worker 选项不被 job 继承）；实测 1/3→2/3→3/3 → failed 带 attempts=3/3；每尝试独立 session（幂等重跑）
> - **超时**：Promise.race 兜底（CP_TASK_TIMEOUT_MS 默认 5min；15s 实测）
> - **人工取消**：`POST /api/tasks/:id/cancel`——queued 移除 job（never_started 实测）；running 由 worker 轮询（3s）关闭 harness 终止运行时（状态保持 killed 不被覆盖）
> - **同用户串行**：per-user promise 链；实测时间戳 TA.finished == TB.started
> - **孤儿回收**：worker 启动扫描 + 60s 周期扫描（实测标记遗留 running → failed）
> - ⚠️ **多 worker 注意**：串行链是 per-worker 进程的；多 worker 部署需 per-user 队列分区或分布式锁（当前单 worker 假设）
> 遗留：并发/资源上限（配合 16，CP_WORKER_CONCURRENCY 已留）、IM 入口接线（18）、跨任务会话连续性、结果回调（webhook/Web 任务中心）。
