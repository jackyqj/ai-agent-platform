# DSH 源码 vendor 记录

- **上游**：https://github.com/deepseek-ai/deepseek-harness
- **vendor 时间**：2026-09-05（由 `dsh-v0.1.3-alpha.1` 覆盖 `dsh-source/`，保留平台自有组件）
- **对应版本**：0.1.3-alpha.1（GitHub 最新 pre-release；npm `latest`/`next` 当时为 `0.1.2-rc.1`）
- **上游 commit 指针**：`d347e703908d0406b7a7ef80e3a0e594d86b2215`（tag `dsh-v0.1.3-alpha.1`）

## 平台自有改动（相对上游，升级时需保留）

| 路径 | 改动 |
|---|---|
| `packages/platform/task-worker/` | 平台任务 Worker（BullMQ 消费 + TS SDK 驱动 `sdk` profile + `--patch`） |
| `packages/platform/tool-mcp-visibility/` | MCP 工具可见性过滤 |
| `packages/session/session-persistence-pg/` | PG SessionPersistence Provider（SessionHandle API） |
| `packages/credentials/credentials-pg/` | PG 凭据 Provider（D20：vault 优先、按请求 resolve） |
| `apps/cli/package.json` | 增加 `@deepseek-ai/dsh-credentials-pg`，供 worker patch 解析 |
| `tsconfig.host.json` / `tsconfig.base.json` | pg / credentials-pg / tool-mcp-visibility 引用与 paths |
| `pnpm-workspace.yaml` | `allowBuilds.msgpackr-extract: false` |
| `tsdown.config.ts` | workspace glob 排除 `packages/platform/*`（Worker 走 tsx，不进 tsdown） |
| `packages/credentials/README.md` / `README.zh.md` | 目录表增加 credentials-pg 行 |
| `scripts/verify-package-readme-model-experience.ts` | credentials-pg / session-persistence-pg allowlist |

## 升级流程

1. `git clone --depth 50 --branch <tag> https://github.com/deepseek-ai/deepseek-harness /tmp/dsh-upstream`
2. 保留平台改动清单中的文件，其余以新上游覆盖 `dsh-source/`
3. `cd dsh-source && pnpm install && pnpm build`
4. 平台组件测试：PG 会话 Provider（`pnpm vitest run packages/session/session-persistence-pg --fileParallelism=false`）+ 凭据 Provider（`pnpm vitest run packages/credentials/credentials-pg`）+ Worker boot 冒烟
5. 更新本文件「对应版本 / commit 指针」，提交
