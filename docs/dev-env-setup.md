# DSH 开发环境搭建记录（Phase 0，01 工单）

> 环境事实：宿主 macOS 为 Node v26.5.0 / pnpm 11.21；当前 DSH `0.2.3-alpha.2` 要求 Node `^24.22.3 || >=26.13.1` 与 pnpm `11.28.5`，升级验证使用隔离 Node v26.13.1。
> 开发基线以 **源码树 `dsh-source/` 为准**（跟随上游，版本锁定策略见 map.md D7）。

## 关键环境事实

| 项 | 值 | 说明 |
|---|---|---|
| 仓库 | `/Users/jac/sw_dir/ai-agent-platform/dsh-source/` | vendor 源码，HEAD = 0.2.3-alpha.2 |
| Node | 宿主 v26.5.0；隔离验证 v26.13.1 | DSH 要求 `^24.22.3 \|\| >=26.13.1` |
| pnpm | 宿主 11.21；DSH pin 11.28.5 | 按 DSH `packageManager` 运行 |
| 构建 | 本次升级的全量 build 与 typecheck 均通过 | `dsh-source/` 上游源码与平台 Provider/Worker |
| 启动 | `pnpm dsh --profile <name> <args>` | TypeScript 源码入口（tsx） |
| DSH_HOME | `/Users/jac/sw_dir/ai-agent-platform/.dsh-home/` | **沙箱要求：DSH_HOME 必须指到工作区内**（`~/.dsh` 会被文件沙箱拦截） |

## 沙箱注意事项（重要）

- `~/.dsh`、`~/.npm` 均在文件沙箱（workspace-write）之外 → 写操作被拒
- 解决：`DSH_HOME=<workspace>/.dsh-home`；npm 用 `--cache <workspace>/.npm-cache`
- 生产部署无此限制，但 DSH_HOME 指向共享目录本就是服务端常态

## 可复现步骤

```sh
# 1. 选择满足 dsh-source/package.json engines 的 Node，并安装 pinned pnpm
npm install --global pnpm@11.28.5
cd dsh-source && pnpm install

# 2. 构建（全量：包 + Web 前端）
pnpm run build

# 3. 验证 CLI
pnpm dsh --help
DSH_HOME=$PWD/../.dsh-home pnpm dsh --profile web --dump-config   # 组合树可观测

# 4. 启动 web（冒烟）
DSH_HOME=$PWD/../.dsh-home pnpm dsh --profile web --port 3277     # HTTP 200 + __DSH_BOOT__

# 5. headless 模式（需模型 key 才能真正跑任务）
DSH_HOME=$PWD/../.dsh-home pnpm dsh --profile headless "task text"
```

## 历史验证结果（2025-08-16）

- [x] `pnpm install` + `pnpm run build` 成功
- [x] `--dump-config` 分层组合树正确（base → web-app → patch）
- [x] web 启动冒烟：HTTP 200，`window.__DSH_BOOT__` 注入，中文 locale
- [x] headless 启动：模型调用失败于 `MISSING_CREDENTIAL`（无 DEEPSEEK_API_KEY，预期）
- [x] **MCP 挂载验证**：headless + mcp-client stdio 成功拉起 `company-mcp-kb` 子进程
  （工具注册先于模型调用；缺 key 失败点确认非 MCP 链路问题）

## DSH 0.2.3-alpha.2 升级验证

- `pnpm install --no-frozen-lockfile` 成功；使用 Node v26.13.1 与 pnpm 11.28.5。
- `pnpm run build` 的 10 个 gate 全部通过；最终代码另经 `pnpm run typecheck` 的 5 个 gate 验证。
- PG Session Provider 测试 35/35、PG Credentials Provider 测试 16/16、Worker 测试 2/2 通过；数据库测试仅使用 `dsh_pg_test`，并仅在该测试库应用 `006_secrets.sql`。
- 公司 profile 与 SDK Worker patch 的 `--dump-config` 均验证了 PG 凭据提供方、MCP 插件及模型路由组合；未执行真实模型调用。
- 文档链接、换行和两个凭据 README 与 Session PG README 的双语配对检查通过。DSH `verify-package-readme-model-experience` 不是平台门禁（Worker 已迁到 `apps/task-worker/`，不走该 glob）。
- 旧版 PG 会话仍保留在数据库中，但 v4 Provider 会拒绝读取 v2 格式；本次未执行数据库迁移。

## 待办（需人类/凭据）

- [ ] 申请模型密钥（云端 DeepSeek 或网关 GATEWAY_KEY，走 D20 密钥服务流程）→ 解锁模型级端到端
- [ ] GPU 到位后按 `03-model-gateway/deploy.md` 部署 vLLM + LiteLLM
