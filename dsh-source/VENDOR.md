# DSH 源码 vendor 记录

- **上游**：https://github.com/deepseek-ai/deepseek-harness
- **vendor 时间**：2026-08-21（由 `dsh-v0.1.0-rc.8` 覆盖 `dsh-source/`，保留平台自有组件）
- **对应版本**：0.1.0-rc.8（GitHub pre-release / npm `next`；npm `latest` 仍为 rc.7）
- **上游 commit 指针**：`141eb6fef83422698aef7a981029e843e8161534`（tag `dsh-v0.1.0-rc.8`）

## 平台自有改动（相对上游，升级时需保留）

| 路径 | 改动 |
|---|---|
| `packages/platform/task-worker/` | 平台任务 Worker（BullMQ 消费 + 可靠性五件套 + workflow/subagent 装配） |
| `packages/session/session-persistence-pg/` | PG SessionPersistence Provider（71/71 测试，100% 覆盖率） |
| `packages/credentials/credentials-pg/` | PG 凭据 Provider（D20：vault 优先、按请求 resolve；交互容器 HTTP 模式） |
| `tsconfig.host.json` | 增加 pg / credentials-pg 包引用 |
| `pnpm-workspace.yaml` | `allowBuilds.msgpackr-extract: false` |
| `tsdown.config.ts` | workspace glob 排除 `packages/platform/*`（Worker 走 tsx，不进 tsdown） |
| `packages/credentials/README.md` / `README.zh.md` | 目录表增加 credentials-pg 行 |
| `scripts/verify-package-readme-model-experience.ts` | credentials-pg allowlist |

## 升级流程

1. `git clone --depth 50 --branch dsh-v0.1.0-rc.8 https://github.com/deepseek-ai/deepseek-harness /tmp/dsh-upstream`
2. 保留平台改动清单中的文件，其余以新上游覆盖 `dsh-source/`
3. `cd dsh-source && pnpm install && pnpm build`
4. 平台组件测试：PG 会话 Provider（`pnpm vitest run packages/session/session-persistence-pg --fileParallelism=false`）+ 凭据 Provider（`pnpm vitest run packages/credentials/credentials-pg`）+ Worker boot 冒烟
5. 更新本文件「对应版本 / commit 指针」，提交
