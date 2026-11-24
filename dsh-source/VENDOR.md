# DSH 源码 vendor 记录

- **上游**：https://github.com/deepseek-ai/deepseek-harness
- **对应版本**：0.2.3-alpha.2（GitHub 最新 pre-release；尚非稳定版）
- **上游 commit 指针**：`4b399c39a6d1479cd84ca591b4d7c88e24d38a96`（tag `dsh-v0.2.3-alpha.2`）
- **上游工具链**：Node `^24.22.3 || >=26.13.1`，pnpm `11.28.5`

`dsh-source/` 是 DSH prefix。平台改动只以**上游没有的路径**出现；禁止手改已存在于上游的文件。术语见仓库根 [GLOSSARY.md](../GLOSSARY.md)（Vendor overlay / 能力缝）。

## Extra 目录（上游没有这些路径）

| 路径 | 角色 |
|---|---|
| `apps/task-worker/` | 平台任务 Worker（BullMQ 消费 + TS SDK 驱动 `sdk` profile + `--patch`） |
| `packages/platform/tool-mcp-visibility/` | MCP 工具可见性过滤（`@deepseek-ai/dsh-tool-mcp-visibility`；所有权仍是 D21） |
| `packages/session/session-persistence-pg/` | PG SessionPersistence adapter |
| `packages/credentials/credentials-pg/` | PG 凭据 adapter（D20：vault 优先、按请求 resolve） |
| `VENDOR.md` | 本文件 |

公司 Cordis patch 在 prefix 外：`configs/company-profile/`、`.dsh-home/profiles/`。

## Overlay recipe（`subtree pull` 之后）

在仓库根执行 `deps/overlay.sh`：`pnpm install` + `pnpm run gen-tsconfig-paths`。这会改 `pnpm-lock.yaml` 和 `tsconfig.base.json` 的 generated region，这是 overlay 的 implementation，不是手改。

不要跑 `gen-doc-graphs`。不要改 `apps/cli/package.json`、`tsconfig.host.json`、`tsdown.config.ts`、组 README、verify-script。

## 升级

1. `git fetch https://github.com/deepseek-ai/deepseek-harness.git tag <tag>`（步骤见 [deps/README.md](../deps/README.md)）
2. `git subtree pull --prefix=dsh-source --squash FETCH_HEAD`
3. `deps/overlay.sh`
4. 平台测试：PG 会话 Provider、凭据 Provider、Worker `resolve-session-id`、`tool-mcp-visibility` vitest
5. 更新本文件指针及 `docs/map.md`、`docs/system-arch42.md`

## Session format compatibility

The new DSH writer uses Session format v4; the previous vendor wrote v2. The platform PG Provider accepts only the current format and does not migrate historical PG rows. It preserves those rows and refuses to open them; migrate them separately before relying on old company-profile sessions.
