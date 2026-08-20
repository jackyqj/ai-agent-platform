# DSH 源码 vendor 记录

- **上游**：https://github.com/deepseek-ai/deepseek-harness
- **vendor 时间**：2025-08-19（由 /Users/jac/sw_dir/dsh/dsh-source 迁入平台仓库）
- **对应版本**：0.1.0-rc.5（源码快照；本机 npm 全局为 rc.6）
- **上游 commit 指针**：待补（原浅克隆 depth-50 后被压成单 commit，未保留 SHA；下次升级时以官方 master 为准重新对齐）

## 平台自有改动（相对上游，升级时需保留）

| 路径 | 改动 |
|---|---|
| `packages/platform/task-worker/` | 平台任务 Worker（BullMQ 消费 + 可靠性五件套 + workflow/subagent 装配） |
| `packages/session/session-persistence-pg/` | PG SessionPersistence Provider（71/71 测试，100% 覆盖率） |
| `packages/credentials/credentials-pg/` | PG 凭据 Provider（D20：vault 优先、按请求 resolve） |
| `tsconfig.host.json` | 增加 pg / credentials-pg 包引用 |
| `pnpm-workspace.yaml` | `allowBuilds.msgpackr-extract: false` |

## 升级流程

1. `git clone --depth 50 https://github.com/deepseek-ai/deepseek-harness /tmp/dsh-upstream`
2. 保留平台改动清单中的文件，其余以新上游覆盖 `dsh-source/`
3. `cd dsh-source && pnpm install && pnpm build`
4. 平台组件测试：PG 会话 Provider（`pnpm vitest run packages/session/session-persistence-pg --fileParallelism=false`）+ 凭据 Provider（`pnpm vitest run packages/credentials/credentials-pg`）+ Worker boot 冒烟
5. 更新本文件「对应版本 / commit 指针」，提交
