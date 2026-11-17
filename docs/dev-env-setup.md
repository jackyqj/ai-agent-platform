# DSH 开发环境搭建记录（Phase 0，01 工单）

> 环境事实：macOS（Node v26.5.0 / pnpm 11.21 / npm 12），仓库 `dsh-source/`（0.1.3-alpha.1，tag `dsh-v0.1.3-alpha.1` / `d347e703`）。
> 开发基线以 **源码树 `dsh-source/` 为准**（跟随上游，版本锁定策略见 map.md D7）。

## 关键环境事实

| 项 | 值 | 说明 |
|---|---|---|
| 仓库 | `/Users/jac/sw_dir/ai-agent-platform/dsh-source/` | vendor 源码，HEAD = 0.1.3-alpha.1 |
| Node | v26.5.0 | 满足 `^22.19 \|\| >=24` |
| pnpm | 11.21（仓库 pin 11.7） | 工作区解析正常 |
| 构建 | `pnpm install` 41.5s + `pnpm run build` 成功 | 219 包 + Web 前端 dist |
| 启动 | `pnpm dsh --profile <name> <args>` | TypeScript 源码入口（tsx） |
| DSH_HOME | `/Users/jac/sw_dir/ai-agent-platform/.dsh-home/` | **沙箱要求：DSH_HOME 必须指到工作区内**（`~/.dsh` 会被文件沙箱拦截） |

## 沙箱注意事项（重要）

- `~/.dsh`、`~/.npm` 均在文件沙箱（workspace-write）之外 → 写操作被拒
- 解决：`DSH_HOME=<workspace>/.dsh-home`；npm 用 `--cache <workspace>/.npm-cache`
- 生产部署无此限制，但 DSH_HOME 指向共享目录本就是服务端常态

## 可复现步骤

```sh
# 1. 安装依赖
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

## 验证结果（2025-08-16）

- [x] `pnpm install` + `pnpm run build` 成功
- [x] `--dump-config` 分层组合树正确（base → web-app → patch）
- [x] web 启动冒烟：HTTP 200，`window.__DSH_BOOT__` 注入，中文 locale
- [x] headless 启动：模型调用失败于 `MISSING_CREDENTIAL`（无 DEEPSEEK_API_KEY，预期）
- [x] **MCP 挂载验证**：headless + mcp-client stdio 成功拉起 `company-mcp-kb` 子进程
  （工具注册先于模型调用；缺 key 失败点确认非 MCP 链路问题）

## 待办（需人类/凭据）

- [ ] 申请模型密钥（云端 DeepSeek 或网关 GATEWAY_KEY，走 D20 密钥服务流程）→ 解锁模型级端到端
- [ ] GPU 到位后按 `03-model-gateway/deploy.md` 部署 vLLM + LiteLLM
