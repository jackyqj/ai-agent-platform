# DSH 源码 vendor（deps）

`dsh-source/` 是 **DeepSeek Harness 上游源码的 vendor 副本**，2025-08-19 从独立工作区迁入本仓库。

## 为什么 vendor 进本仓库

| 组件 | 位置 | 说明 |
|---|---|---|
| 任务 Worker | `dsh-source/packages/platform/task-worker/` | 平台自有（D21）：BullMQ 消费端 + TS SDK 驱动 DSH 运行时；依赖 `workspace:^` 的 `@deepseek-ai/dsh-*` 包，须在 workspace 上下文解析 |
| PG 会话持久化 Provider | `dsh-source/packages/session/session-persistence-pg/` | 平台自有（D21）：PG SessionPersistence；依赖 workspace 包 + 共享测试契约（`session-persistence/tests/contract.ts`），测试须在工作区跑 |

两组件曾尝试迁出 + 符号链接，pnpm/vitest 按真实路径解析导致 `bullmq` 找不到、`tsconfig not found`。
**vendor 整树是唯一可靠方式**：单仓库 clone 即跑、版本随平台 commit 固化、协作/CI 只拉一个仓库。

## 上游与升级

- 上游：https://github.com/deepseek-ai/deepseek-harness（master；当前 vendor 对应 rc.5 快照，commit 指针见 `dsh-source/VENDOR.md`）
- 平台改动（相对上游）：`packages/platform/task-worker/`、`packages/session/session-persistence-pg/`、
  `tsconfig.host.json`（pg 包引用）、`pnpm-workspace.yaml`（`allowBuilds.msgpackr-extract: false`）
- **升级流程**：拉取上游新 commit → 覆盖 `dsh-source/`（保留平台组件与本地改动）→ 全量 build/test →
  按 `deps/README.md` 旧版策略处理接口变化。未来可转 `git subtree pull`（需先给 dsh 历史补 remote）。

## 终局路径（不变）

DSH 发布首个 tagged release（接口冻结、npm 安装形态）后，两组件重新打包为平台仓库中的
out-of-tree 插件（`dsh plugin` 安装到 profile），届时脱离 workspace，`dsh-source/` 可冻结或移除。

## 本地开发提示

- 改 Worker/Provider → 直接改 `dsh-source/packages/platform/task-worker/` 或 `dsh-source/packages/session/session-persistence-pg/`
- Provider 测试：`cd dsh-source && DATABASE_URL=... pnpm vitest run packages/session/session-persistence-pg --fileParallelism=false`
- Worker：`cd dsh-source/packages/platform/task-worker && ./node_modules/.bin/tsx src/worker.ts`
- DSH_HOME：`/Users/jac/sw_dir/ai-agent-platform/.dsh-home`（presets-company/profiles 入库，sessions 运行态不入库）
