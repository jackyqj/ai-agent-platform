# DSH prefix 与 Vendor overlay

`dsh-source/` 是 DeepSeek Harness 的 **DSH prefix**，当前对齐 `0.2.3-alpha.2`（指针见 `dsh-source/VENDOR.md`）。平台自有代码是 **Vendor overlay**：只以 extra 目录出现，禁止手改上游已有文件。词汇见根目录 [GLOSSARY.md](../GLOSSARY.md)。

包必须留在 DSH pnpm workspace（`packages/*/*` 或 `apps/*`）。迁出 + 符号链接已在 pnpm/vitest 上失败。

## Extra 目录

| 路径 | 说明 |
|---|---|
| `dsh-source/apps/task-worker/` | 平台任务 Worker（D21）：BullMQ 消费端 + TS SDK；`apps/*` 在 workspace 内且不进 tsdown glob |
| `dsh-source/packages/platform/tool-mcp-visibility/` | MCP 可见性插件；包名为 `@deepseek-ai/dsh-tool-mcp-visibility` 以便 `gen-tsconfig-paths` 写入 generated region |
| `dsh-source/packages/session/session-persistence-pg/` | PG SessionPersistence adapter（能力缝，挨着 JSONL/SQLite sibling） |
| `dsh-source/packages/credentials/credentials-pg/` | PG 凭据 adapter（D20）；不改组 README |

## Overlay recipe

`subtree pull` 之后在仓库根跑：

```sh
./deps/overlay.sh
```

它只做 `pnpm install` 和 `pnpm run gen-tsconfig-paths`。lockfile 与 `tsconfig.base.json` 的 generated region 会相对上游变脏，这是 overlay 的 implementation。

不要手改 `apps/cli/package.json`、`tsconfig.host.json`、`tsdown.config.ts`、组 README、`scripts/verify-package-readme-model-experience.ts`。不要跑 `gen-doc-graphs` 当产品门禁。源码 `dsh` + tsx worker 是这一阶段的运行时；extra 包不进 `tsconfig.host.json`，所以 prefix 上的 `pnpm build` 不是 overlay 门禁。built `dsh` 若以后要解析平台插件，装到 `.dsh-home` profile，仍不碰 CLI manifest。

## 转 subtree（一次性）

prefix 已存在且没有 git-subtree 记录。转换顺序：

1. 完成本 overlay（extra 目录 + 上游文件恢复为手改前）
2. 把 extra 目录挪出 `dsh-source/`
3. 删除 `dsh-source/`
4. `git remote add dsh https://github.com/deepseek-ai/deepseek-harness.git`（若尚未添加）
5. `git fetch dsh tag dsh-v0.2.3-alpha.2`
6. `git subtree add --prefix=dsh-source --squash dsh dsh-v0.2.3-alpha.2`
7. extra 目录放回，跑 `./deps/overlay.sh`

之后升级走 `git subtree pull --prefix=dsh-source --squash dsh <tag>`，再 overlay。

`git subtree add` 会生成 commit，需要单独执行。

## 终局路径（不变）

DSH 发布稳定版（接口冻结、npm 安装形态）后，adapter 重新打包为平台仓库中的 out-of-tree 插件（`dsh plugin` 安装到 profile），届时脱离 workspace，`dsh-source/` 可冻结或移除。

## 本地开发提示

- 改 Worker → `dsh-source/apps/task-worker/`
- 改 MCP 可见性 → `dsh-source/packages/platform/tool-mcp-visibility/`
- 改 PG adapter → `dsh-source/packages/session/session-persistence-pg/` 或 `dsh-source/packages/credentials/credentials-pg/`
- Provider 测试：`cd dsh-source && DATABASE_URL=... pnpm vitest run packages/session/session-persistence-pg --fileParallelism=false`
- 凭据 Provider：`cd dsh-source && pnpm vitest run packages/credentials/credentials-pg`
- MCP 可见性：`cd dsh-source && pnpm vitest run packages/platform/tool-mcp-visibility`
- Worker：`cd dsh-source/apps/task-worker && ./node_modules/.bin/tsx src/worker.ts`
- DSH_HOME：仓库内 `.dsh-home`（presets-company/profiles 入库，sessions 运行态不入库）
