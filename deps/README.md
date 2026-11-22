# DSH 源码 vendor（deps）

`dsh-source/` 是 **DeepSeek Harness 上游源码的 vendor 副本**，当前对齐 `0.2.3-alpha.2`（2026-11-22 从 tag `dsh-v0.2.3-alpha.2` 覆盖；指针见 `dsh-source/VENDOR.md`）。该版本为预发布版。

## 为什么 vendor 进本仓库

| 组件 | 位置 | 说明 |
|---|---|---|
| 任务 Worker | `dsh-source/packages/platform/task-worker/` | 平台自有（D21）：BullMQ 消费端 + TS SDK 驱动 DSH 运行时；依赖 `workspace:^` 的 `@deepseek-ai/dsh-*` 包，须在 workspace 上下文解析 |
| PG 会话持久化 Provider | `dsh-source/packages/session/session-persistence-pg/` | 平台自有（D21）：PG SessionPersistence；依赖 workspace 包 + 共享测试契约（`session-persistence/tests/contract.ts`），测试须在工作区跑 |
| PG 凭据 Provider | `dsh-source/packages/credentials/credentials-pg/` | 平台自有（D20）：`ctx.credentials` 读 vault 或 HTTP resolve，按请求解析 |

两组件曾尝试迁出 + 符号链接，pnpm/vitest 按真实路径解析导致 `bullmq` 找不到、`tsconfig not found`。
**vendor 整树是唯一可靠方式**：单仓库 clone 即跑、版本随平台 commit 固化、协作/CI 只拉一个仓库。

## 上游与升级

- 上游：https://github.com/deepseek-ai/deepseek-harness（当前 vendor 对应 `0.2.3-alpha.2` / `4b399c39`，指针见 `dsh-source/VENDOR.md`）
- 平台改动（相对上游）：`packages/platform/task-worker/`、`packages/session/session-persistence-pg/`、
  `packages/credentials/credentials-pg/`、`apps/cli/package.json`、`tsconfig.host.json` / `tsconfig.base.json`（平台引用与 alias）、`tsdown.config.ts`（排除 `packages/platform`）、Worker 的网关路由配置。`allowBuilds.msgpackr-extract: false` 已由当前上游提供。
- **升级流程**：满足 DSH Node `^24.22.3 || >=26.13.1` 与 pnpm `11.28.5` → 拉取上游新 commit → 覆盖 `dsh-source/`（保留平台组件与本地改动）→ 全量 build/test →
  按 `deps/README.md` 旧版策略处理接口变化。未来可转 `git subtree pull`（需先给 dsh 历史补 remote）。

## 终局路径（不变）

DSH 发布稳定版（接口冻结、npm 安装形态）后，两组件重新打包为平台仓库中的
out-of-tree 插件（`dsh plugin` 安装到 profile），届时脱离 workspace，`dsh-source/` 可冻结或移除。

## 本地开发提示

- 改 Worker/Provider → 直接改 `dsh-source/packages/platform/task-worker/`、`dsh-source/packages/session/session-persistence-pg/` 或 `dsh-source/packages/credentials/credentials-pg/`
- Provider 测试：`cd dsh-source && DATABASE_URL=... pnpm vitest run packages/session/session-persistence-pg --fileParallelism=false`
- 凭据 Provider：`cd dsh-source && pnpm vitest run packages/credentials/credentials-pg`
- Worker：`cd dsh-source/packages/platform/task-worker && ./node_modules/.bin/tsx src/worker.ts`
- DSH_HOME：`/Users/jac/sw_dir/ai-agent-platform/.dsh-home`（presets-company/profiles 入库，sessions 运行态不入库）
