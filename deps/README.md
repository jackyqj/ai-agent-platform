# DSH 耦合组件（deps）

以下平台组件**物理位于 DSH 工作区**（`/Users/jac/sw_dir/dsh/dsh-source/`），而非本仓库——这是技术必然，不是疏漏。

## 为什么不能搬进本仓库

| 组件 | 位置 | 耦合原因 |
|---|---|---|
| 任务 Worker | `dsh-source/packages/platform/task-worker/` | 依赖 DSH workspace 的 `@deepseek-ai/dsh-sdk-client` 等（`workspace:^`）；运行时由控制面以子进程拉起，需在 workspace 上下文解析 |
| PG 会话持久化 Provider | `dsh-source/packages/session/session-persistence-pg/` | 依赖 `@deepseek-ai/dsh-session-persistence` 等 workspace 包 + **共享测试契约**（`session-persistence/tests/contract.ts`），测试须在 DSH 工作区跑 |

实测验证：两组件曾尝试迁出 + 符号链接回 dsh-source，但 pnpm/vitest 按真实路径解析，
workspace 依赖与共享契约无法物化（`bullmq` 找不到、`tsconfig not found`）。**结论：随工作区托管是唯一可靠方式。**

## 版本与同步策略

- 两组件为**平台自有**（D21）：非上游 PR 提交物；`session-persistence-pg` 已达上游覆盖率门禁（71/71，100%×4）
- DSH 升级（rc.5 → 后续版）时：平台组件随工作区一起 build/test；接口变化由平台自管跟进
- **未来迁移路径**：DSH 发布首个 tagged release（接口冻结、npm 安装形态）后，
  两组件可重新打包为平台仓库中的 out-of-tree 插件（`dsh plugin` 安装到 profile），届时脱离工作区

## 平台仓库侧的对应物

- Worker 配置：`services/task-worker` 目录**已删除**（worker 本体在工作区）；其 `worker.cordis.yml`
  权威副本在工作区 `packages/platform/task-worker/worker.cordis.yml`
- Provider：无平台侧副本（权威在工作区）

## 本地开发提示

- 改 Worker/Provider → 直接改 `dsh-source/packages/platform/task-worker/` 或
  `dsh-source/packages/session/session-persistence-pg/`
- 跑 Provider 测试：`cd dsh-source && DATABASE_URL=... pnpm vitest run packages/session/session-persistence-pg --fileParallelism=false`
- 跑 Worker：`cd dsh-source/packages/platform/task-worker && ./node_modules/.bin/tsx src/worker.ts`
