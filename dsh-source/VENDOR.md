# DSH 源码 vendor 记录

- **上游**：https://github.com/deepseek-ai/deepseek-harness
- **vendor 时间**：2026-11-22（由 `dsh-v0.2.3-alpha.2` 覆盖 `dsh-source/`，保留平台自有组件）
- **对应版本**：0.2.3-alpha.2（GitHub 最新 pre-release；尚非稳定版）
- **上游 commit 指针**：`4b399c39a6d1479cd84ca591b4d7c88e24d38a96`（tag `dsh-v0.2.3-alpha.2`）
- **上游工具链**：Node `^24.22.3 || >=26.13.1`，pnpm `11.28.5`

## 平台自有改动（相对上游，升级时需保留）

| 路径 | 改动 |
|---|---|
| `packages/platform/task-worker/` | 平台任务 Worker（BullMQ 消费 + TS SDK 驱动 `sdk` profile + `--patch`；显式禁用默认本地凭据 Provider，再插入 PG Provider） |
| `packages/platform/tool-mcp-visibility/` | MCP 工具可见性过滤 |
| `packages/session/session-persistence-pg/` | PG SessionPersistence Provider（新版读取所有权契约、深冻结存储事件、fork 历史复制，以及先关闭句柄再关闭 PG pool） |
| `packages/credentials/credentials-pg/` | PG 凭据 Provider（D20：vault 优先、按请求 resolve） |
| `apps/cli/package.json` | 增加 `@deepseek-ai/dsh-credentials-pg`，供 worker patch 解析 |
| `tsconfig.host.json` / `tsconfig.base.json` | 平台包 project references 与 `tool-mcp-visibility` alias；其余 workspace alias 由上游脚本生成 |
| `tsdown.config.ts` | workspace glob 排除 `packages/platform/*`（Worker 走 tsx，不进 tsdown） |
| 平台包 `package.json` / `tsconfig.json` | 移除上游已删除的 `dsh-invariants` companion 出口、依赖与 project reference；这些 companion 原本不注册运行时不变量 |
| `packages/credentials/README.md` / `README.zh.md` / `README.i18n.yaml` | 目录表增加 credentials-pg 行并维护双语配对 |
| `packages/credentials/credentials-pg/README.md` / `README.zh.md` / `README.i18n.yaml` | 补齐平台 Provider 的双语包文档 |
| `packages/session/session-persistence-pg/README.md` / `README.zh.md` / `README.i18n.yaml` | 补齐平台 Provider 的双语包文档并记录旧格式限制 |
| `scripts/verify-package-readme-model-experience.ts` | credentials-pg / session-persistence-pg allowlist |
| `packages/platform/task-worker/` | LiteLLM 网关走新版 `llm-pi-ai` gateway route；官方直连仍走 `deepseek-official` |
| `configs/company-profile/company/cordis.patch.yml`、`.dsh-home/profiles/company/cordis.patch.yml` | 按新版 patch 规则禁用默认本地凭据 Provider、插入 PG Provider；MCP 插件使用 insert |

## Session format compatibility

The new DSH writer uses Session format v4; the previous vendor wrote v2. The platform PG Provider accepts only the current format and does not migrate historical PG rows. It preserves those rows and refuses to open them; migrate them separately before relying on old company-profile sessions.

## 升级流程

1. `git clone --depth 50 --branch <tag> https://github.com/deepseek-ai/deepseek-harness /tmp/dsh-upstream`
2. 保留平台改动清单中的文件，其余以新上游覆盖 `dsh-source/`
3. 使用满足上游 engines 的 Node 与 pnpm `11.28.5`：`cd dsh-source && pnpm install && pnpm build`
4. 平台组件测试：PG 会话 Provider（`pnpm vitest run packages/session/session-persistence-pg --fileParallelism=false`）+ 凭据 Provider（`pnpm vitest run packages/credentials/credentials-pg`）+ Worker boot 冒烟
5. 更新本文件「对应版本 / commit 指针」及 `docs/map.md`、`docs/system-arch42.md`，提交
