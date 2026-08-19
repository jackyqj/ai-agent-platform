# DeepSeek Harness 企业级 AI Agent 平台适配评估报告

> 调研对象：GitHub `deepseek-ai/deepseek-harness`，npm 包 `@deepseek-ai/dsh`，版本 `0.1.0-rc.5`（2026-08-13 公开发布）
> 调研方法：浅克隆（depth 50）至本地 `dsh-source/`，通读 README、`docs/architecture.md`、`docs/api-gateway.md`、`docs/tool-catalog.md`、各关键包 README 与 cookbook。所有结论均给出包名/路径证据；未写明的部分明确标注"无证据/未文档化"。

## 结论摘要（TL;DR）

DeepSeek Harness 是一个**架构上极其先进、但当前定位为"单机单用户开发者工具"**的 Cordis 全插件化 Agent harness。它具备做企业平台的地基（事件溯源会话、能力 seam、沙箱、审批、OTel 遥测、SQLite/JSONL 持久化、MCP 客户端、子代理/工作流编排、React Web UI），但**缺少企业平台最核心的 authN/authZ、多租户、集中存储与运维层**，且处于"兼容性可随时破坏"的 pre-release 阶段。结论：**可作为 3+ 个月自建平台的地基/参考架构，但必须在其上补一层"企业外壳"**（见第 7 节），不适合开箱即用直接上生产。

| 维度 | 现状 | 结论 |
|---|---|---|
| 总体架构 | 全插件化（Cordis），profile/bundle 分层组装 | ✅ 极佳的可扩展地基 |
| 部署模型 | 默认绑定 127.0.0.1 的单用户 Web 服务 | ⚠️ 需自建认证/反向代理/多用户化 |
| 认证/身份 | 仅匿名 UUID，无登录/SSO/账户 | ❌ 缺失 |
| 权限/审批 | 沙箱模式+审批策略 preset、一次性审批 | ⚠️ 单机级，无 RBAC |
| 审计/遥测 | 事件溯源日志 + OTel 导出 + 日志 ZIP 导出 | ✅ 基础齐全 |
| RAG/知识库 | 无内置 RAG/向量库，全靠 MCP/外部工具 | ❌ 需自建 |
| 工作流编排 | workflow/subagent/goal/jobs/schedule 齐全 | ✅ 可直接复用 |
| 版本/许可 | MIT，0.1.0-rc.5，开发者预览，破坏性变更 | ⚠️ 需锁定版本+充分测试 |

---

## 1. 总体架构

### 单仓结构

pnpm workspaces 单仓（`pnpm-workspace.yaml`），`packages/*/*` 二级结构：`packages/<组>/<包>`，共 **219 个 package.json（约 190 个 `@deepseek-ai/dsh-*` 发布包）**。主要分组（见 `dsh-source/AGENTS.md` 的 Repository layout）：`core/`（会话、工具、agent、agent-loop）、`api/`（Typert RPC 网关/BFF）、`llm/`、`fs/`、`shell/`、`subprocess/`、`sandbox/`、`subagent/`、`session/`（持久化/投影/标题/遥测）、`interaction/`（审批/权限/命令）、`bundle/`（profile 补丁层）、`workflow/`、`web/`、`credentials/`、`identity/`、`mcp/`、`acp/`、`sdk/` 等。另有 `apps/cli`（`@deepseek-ai/dsh`，`dsh` 命令）、`apps/web`（`@deepseek-ai/dsh-web-frontend`，Vite + **React 18**）、`vendor/`（Cordis 及其依赖的 vendored 源码）、`python/`（Python SDK + 打包运行时）、`native/`（Landlock 启动器）、`website/`（VitePress 文档站）。

### 核心哲学：一切皆插件（Cordis）

`docs/architecture.md` 开篇："[Cordis](https://github.com/cordiverse/cordis) is the framework under dsh: plugins contribute services, typed events, and reversible effects to a shared context. **Every part of the product is a plugin**, including the model adapter, the tool registry, the session log, and the agent loop itself"；"There is no privileged core to patch: you extend dsh by mounting a plugin beside the others"。Cordis 被 vendored 为 `@deepseek-ai/cordis`（`vendor/`，由 `pnpm-workspace.yaml` 的 `overrides` 指向本地源码）。

### profile / bundle / patch 分层组装

- **profile**：存放在 harness home（`$DSH_HOME/profiles/<name>`）的具名组合，声明其 bundle 列表与用户自己的 `cordis.patch.yml`；`web` 与 `headless` 内置为模板（`apps/cli/README.md`）。
- **bundle**：Cordis 配置行的分发格式，通过 `package.json` 的 `dsh.bundle.patch` 字段指向补丁文件。三个产品级 bundle：
  - `@deepseek-ai/dsh-base`（`packages/bundle/base/`）：每个 profile 的第一层——模型适配器、工具、持久化、沙箱与审批策略、settings、credentials、遥测、host 级子代理 provider。
  - `@deepseek-ai/dsh-web-app`（`packages/bundle/web-app/`）：叠加 Web 表面——webserver、API 网关、workspace、投影缓存、存储、浏览器插件列表、client HMR。
  - `@deepseek-ai/dsh-headless`（`packages/bundle/headless/`）：无服务器的一次性 runner。
- **patch 层序**：profile 内 bundle 按列表顺序 → profile `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch` 覆盖；patch 按行 id **整体替换** config（无深合并，见 `packages/bundle/base/README.md` Known Limitations）。`dsh --profile web --dump-config` 可查看最终组装树。

### 核心包（ctx key，见 `docs/architecture.md`）

`core/session`（`ctx.sessions`，追加式 `SessionEvent` 日志）、`core/system-prompt`（`ctx.systemPrompt`）、`core/tools`（`ctx.tools`，作用域化工具注册表+守卫执行管道）、`core/agent`（`ctx.agents`）、`core/agent-loop`（`ctx.agentLoop`，默认驱动）、`core/scope`（每 agent 作用域注册原语）、`llm/llm`（`ctx.llm`）。事件是扩展点：session 事件（持久）、agent 事件（`agent/*`，实时）、capability 事件（`fs/*`、`tools/*`、`telemetry/*`）。**"Model-visible ⟺ logged"**：任何进入模型请求的内容必须可从会话日志重建（`docs/architecture.md` § Session log）。

### 能力 seam（capability seam）

服务定义/服务提供者/消费者三角色分离（`docs/capability-seams.md`），"one provider swap changes the whole product"——例如把 `ctx.fs`/`ctx.subprocess` provider 指向远程沙箱即可整体迁移执行世界。这是平台化最重要的架构资产。

## 2. 部署模型：单用户本地优先，非服务器多用户

**结论：DSH 按"单机单用户"设计**，证据：

1. **Web server 只绑定 loopback**：`packages/host/webserver/README.md`："`host` accepts only `127.0.0.1` (default posture) and `0.0.0.0` (deliberate network exposure)"；**"No TLS, auth, or origin policy — binding a non-loopback address exposes the server to that network; deployment hardening (or fronting it with a real reverse proxy) is deliberately out of scope for the dev-facing v1."** `dsh-web-app` 明确拒绝 `--host 0.0.0.0`（"the CLI intentionally does not support all-interfaces binding yet"）。
2. **浏览器信任围栏是可达性策略而非认证**：`packages/client/connection/README.md`："The fence is a reachability policy, **not authentication**; the Web carrier provides no authentication layer"；"`dsh web --host 0.0.0.0` is intentionally unsupported **until remote access has an authentication layer**"。
3. **存储全部在本地盘**：会话以 `$DSH_HOME` 下 `<root>/--<normalized-cwd>--/<encoded-id>/session.jsonl.zstd`（`packages/session/session-persistence-jsonl/README.md`）或 SQLite（`dsh-session-persistence-sqlite`，`node:sqlite`，WAL）持久化；settings 存 `settings.yaml`（`dsh-settings-file`）；密钥存 `$DSH_HOME/.credentials.yaml` + `.env` 分层（`packages/credentials/credentials-local/README.md`）；匿名身份存 `~/.dsh/.anonymous-user-id`。全部为**每进程/每机器本地文件**，无集中式数据库/对象存储。
4. **"工作区"是本地目录集合**：`dsh-workspace` 是同一 harness home 下的多个本地目录注册表，不是多租户 workspace。
5. **可编程接入是子进程协议**：自动化走 ACP（`packages/acp/`，JSON-RPC stdio）或 JSON-RPC server（`packages/sdk/`，Python SDK `deepseek-harness-sdk` 以子进程方式驱动）。

**要跑成共享内部服务需要**：前置反向代理（TLS + 在代理层挂 SSO/OIDC）；因无内置认证层，`--host 0.0.0.0` 需要打补丁或改代码放开；把会话/凭据/settings 从本地文件迁移到集中存储（SQLite 后端是本地单文件，需自建同步/共享层）；每用户隔离（目前整个 `$DSH_HOME` 是单一信任域）。

## 3. 企业特性清单（以包名为证）

| 能力 | 现状 | 证据包 |
|---|---|---|
| 认证/用户身份 | **仅匿名**：每 harness home 一个随机 UUID，用于遥测/反馈/DeepSeek provider 头。**无登录、无账户、无 SSO/OIDC**（全仓 grep `sso/oidc/oauth/auth` 无任何功能实现） | `dsh-anonymous-user-id` |
| 权限 | 权限 preset：`sandbox/mode` × `approval/policy` 二旋钮（默认 `workspace-write`+`ask`、`danger-full-access`+`never`），会话级选择，无角色/RBAC | `dsh-permission-presets`、`dsh-scope`（显式声明"not sandboxes or authority boundaries"）、`dsh-sandbox-policy` |
| 用户审批流 | 一次性审批 seam：`ctx.approval.request()` 返回 `allowed-once/rejected/cancelled/unavailable`，附 `approval/asked`+`approval/decided` 审计事件，失败闭合；**无 allow-always、无授权存储、无内置答询者**（headless 下直接 unavailable） | `dsh-user-approval` |
| 审计日志 | ① 会话本身是追加式事件日志（`SESSION_FORMAT_VERSION=0`，格式无兼容承诺）② OTel 导出（OTLP/HTTP，`FULL/FEEDBACK_ONLY/DISABLED`，匿名 `user.id`，可挂 redaction waterfall）③ 会话日志 ZIP 下载（`GET /api/session.export?sessionId=…`，含子会话与附件） | `dsh-session`、`dsh-session-telemetry-otel`、`dsh-session-log-export`、`dsh-host-apiproxy` |
| 凭据/密钥 | 引用式凭据：配置只存 `apiKeyEnv` 引用，`ctx.credentials.resolve()` 每次操作即时解析，绝不缓存；env > `$DSH_HOME/.credentials.yaml` > `.env` 分层，读源不可写（fail-loud）。**无 vault 集成** | `dsh-credentials`、`dsh-credentials-local` |
| 沙箱 | 进程沙箱 seam：`read-only/workspace-write/danger-full-access`（仅文件效应）；Linux bwrap/Landlock、macOS Seatbelt、Windows ACL restricted-token runner；`fs-observation-policy` 实现读前编辑守卫。**无网络/系统调用/设备限制** | `dsh-sandbox`、`dsh-sandbox-local`、`dsh-sandbox-windows-acl`、`dsh-fs-observation-policy` |
| 限流 | **不存在**：全仓无 rate-limit/quota 包，仅有 LLM 重试策略（`llm-retry`）与 OTel batch processor 参数 | （无） |
| 模型密钥管理 | Web 设置页 Models：provider 目录、密钥 write-only 写入（绝不回显）、模型发现/自定义 OpenAI 兼容端点、`<ROUTE>_API_KEY` 派生 | `dsh-client-ui-settings-models`、`dsh-settings`、`dsh-settings-file`、`dsh-llm-pi-ai` |
| 用量/配额 | 每会话分析：token 估算（4 字符/token 启发式+provider usage 锚定；`tokenUsage`/`contextPressure` 投影）、会话统计（turn/step/llmMs/ttftMs/toolMs）。**仅统计，无配额强制执行/计费** | `dsh-token-meter`、`dsh-session-stats`、`dsh-session-projection` |

## 4. 扩展机制

- **写新插件**：官方 cookbook `docs/cookbook/adding-a-package.md`（逐步清单：`packages/<组>/<包>` 布局、package.json 不变量、注册到 tsconfig/knip、README 模板），以及 `adding-a-tool.md`、`adding-an-llm-adapter.md`、`adding-a-conversation-node.md`。`docs/architecture.md` § Where new behavior goes 给出"目标→机制"映射表（加模型→注册 `ctx.llm`；加能力→注册 `ctx.tools`；加 shell→`ctx.shell`；加后台任务→`ctx.jobs`…）。所有注册是 effect，插件卸载自动回滚。
- **MCP 消费**：`packages/mcp/mcp-client/README.md`——一个插件实例对应一台 MCP server，`cordis.yml` 配置；**传输仅支持 `stdio` 与 `streamable-http`**（无旧版 SSE-only 传输）；自动发现工具并注册为 `mcp__<serverName>__<rawName>`（服务端限定命名，64 字符函数名契约+冲突哈希）；支持 env 清洗、自动重连（指数退避）、`toolCallTimeoutMs`。官方示例 `examples/mcp-memory/` 演示接 Memorix / MCP Reference Memory / Engram 三种第三方记忆服务。
- **新增 LLM provider**：`dsh-llm` 定义适配器 seam（`ctx.llm.registerAdapter(providers, adapter)` + `llm/stream` waterfall 拦截）；两个出厂实现：`dsh-llm-deepseek`（官方 chat-completions，直接 fetch+SSE，路由 `deepseek-official`）与 `dsh-llm-pi-ai`（经 `@earendil-works/pi-ai` 的多 provider 适配器，OpenAI 兼容网关/自托管端点只需配置不用写代码）。按 cookbook 继承 `LlmAdapter` 即可加新 provider。
- **扩展 Web UI**：客户端插件机制——`packages/client/*` 包声明 `dsh.client`、导出 `./client`、经共享 tsdown preset 产出浏览器 bundle；React 胶水在 `@deepseek-ai/dsh-client-web-react`（slot renderer、`SessionProvider`、hooks）；聊天视图通过注册 `ConversationNodeDefinition` + keyed renderer 添加新节点类型（`docs/cookbook/adding-a-conversation-node.md`）；UI 组件库在 `dsh-client-ui-*`（约 40 个包：conversation、deliverables、goal、jobs、settings-models、permission-presets、trajectory、workflow-run…）。
- **程序化接入**：ACP 自动化服务端（`dsh-acp`，JSON-RPC stdio）+ JSON-RPC server/client（`dsh-sdk-*`）+ Python SDK（`deepseek-harness-sdk`）。

## 5. RAG / 知识库：无内置，全外部

**没有内置 RAG/embedding/向量库/文档摄取**。全仓 grep `embedding/vector store/RAG/knowledge base` 无任何实现（仅有 substring 误匹配），包清单中无相关包，`docs/tool-catalog.md` 无检索类工具。相关知识来源全部是"外部接入"：

- MCP 第三方记忆/知识服务（`examples/mcp-memory/`，且 README 明示 DSH 不负责 embedding/向量库："DSH does **not** download the server, initialize its database, choose its model or **embedding provider**…"）；
- 外部 Web 搜索 provider（`dsh-web-search-deepseek`/`-exa`/`-perplexity`，走 `ctx.web` seam）；
- 会话日志检索工具（`dsh-tool-session-query`：`session_search`/`session_event_search` 等 5 个只读工具，基于 SQLite 游标，**是日志搜索不是向量检索**）；
- 本地技能目录（`dsh-skill-filesystem`）与 ripgrep 文件搜索（`dsh-tool-fs-search` 的 `glob`/`grep`）。

企业知识库 RAG 需自建：文档摄取管道、embedding 服务、向量库，然后以自定义工具或 MCP server 形式暴露给 `ctx.tools`。

## 6. 工作流与编排：可直接复用

- **`dsh-workflow`**（`ctx.workflowEngine`）：模型编写的 JS 编排脚本，可 fan-out 子代理（`parallel`/`pipeline`/`phase`/`log` 钩子，与本文档系统同源）；引擎为 worker-thread（`dsh-workflow-worker-thread`），模型侧入口 `dsh-tool-workflow`。
- **`dsh-subagent`**（`ctx.subagents`）：子代理 seam，provider 可插拔——in-process/fork（`dsh-subagent-fork-in-process`、`dsh-subagent-spawn-in-process`）、外部产品（`dsh-subagent-codex`、`dsh-subagent-claude-code`）、ACP（`dsh-subagent-acp`）、JSON-RPC（`dsh-subagent-dsh-sdk`）；支持 one-shot 与可续聊（continuable，含 `interrupt`/`followup`/`report`）两种模式；工具：`subagent`/`subagent_fork`/`interrupt_agent`/`list_agents`/`send_message`/`report`。
- **`dsh-goal` + `dsh-goal-round-driver` + `dsh-tool-goal`**：同会话持久目标（create/edit/pause/resume/complete/blocked），Compare-and-set 修订、事件溯源重放。
- **`dsh-jobs` + `dsh-jobs-local` + `dsh-tool-jobs`**：后台任务注册表（`job_start` 语义由 producer 持有，`job_kill`/`job_list`/`job_output` 工具），bash/PTY/subagent 均接入。
- **`dsh-schedule`**：会话级持久提醒（`schedule_create/delete/list`，支持 after/at/every），状态在会话事件日志中，仅对"未来活跃的根 Agent"生效。
- **对终端用户可复用**：四种把 agent 暴露成服务的方式——Web UI（每会话选择 agent preset）、`dsh --profile headless "task"`、ACP server、Python SDK/JSON-RPC。**agent preset**（`dsh-agent-presets`，`agent.cordis.yml` 目录）可按 preset 组装"角色化 agent"（工具集/提示词/投影单元），是平台"预置 agent 模板"的直接对应物。

## 7. 企业化差距清单（50–500 用户平台需自建项）

| # | 差距 | 证据 | 需自建 |
|---|---|---|---|
| 1 | **无认证/SSO/用户账户** | 仅 `dsh-anonymous-user-id`；webserver "no auth"；connection "provides no authentication layer" | OIDC/SSO 网关插件（或代理层）；用户身份与每用户 harness home/存储隔离 |
| 2 | **无多租户/多用户数据模型** | `$DSH_HOME` 单一信任域；workspace 为本地目录；会话/凭据/settings 均为本地文件 | 集中式会话库、用户级数据分区、租户管理面 |
| 3 | **无管理控制台/RBAC** | 权限仅有 `sandbox/mode`+`approval/policy` 二旋钮；`dsh-scope` 明示非权限边界 | 角色/权限模型、用户管理、审批工作流（多级审批、授权存储） |
| 4 | **无限流/配额强制执行** | 全仓无 rate-limit/quota 包；`token-meter`/`session-stats` 仅统计 | 网关层限流、token/预算配额服务 |
| 5 | **密钥管理单机化** | `credentials-local` 文件/环境分层，无 vault | 对接公司 secret 管理（参考 seam 实现新 provider 即可） |
| 6 | **审计链路需自建收集端** | OTel 导出器已具备（OTLP/HTTP），但 collector/存储/查询需自建 | OTel collector + 日志平台接入 |
| 7 | **无内置 RAG** | 见第 5 节 | 文档摄取+向量库+RAG 服务（以 MCP/工具接入） |
| 8 | **数据库/内部 API 工具需自研** | 无现成数据库/内部 API 连接器；`dsh-tool-*` 仅文件/shell/web 类 | 内部工具服务（照 cookbook 注册到 `ctx.tools` 或 MCP server） |
| 9 | **pre-release 风险** | README："THERE WILL BE COMPATIBILITY-BREAKING CHANGES"；`SESSION_FORMAT_VERSION=0` 无兼容承诺；AGENTS.md："Remove this section at the first tagged release" | 锁定版本、冻结格式、充分集成测试；关注首个 tagged release |
| 10 | **头尾工程缺失** | 无安装器/升级器/健康检查/监控大盘/错误上报 | 平台运维面自建 |

## 8. 版本 / 许可 / 路线图信号

- **许可**：MIT（根 `LICENSE`）；第三方依赖在 `THIRD_PARTY_NOTICES.md` 披露。
- **版本**：`0.1.0-rc.5`（根与全部包一致）；Node `^22.19 || >=24`，pnpm 11.7。
- **活跃度**：仓库 2026-08-13 公开（GitHub API `created_at: 2026-08-13`），最近提交 2026-08-13（`release(dsh): 0.1.0-rc.5` / `publish the dsh family publicly`）；检查时点（2026-08-16）GitHub API 显示 **~12.6 万 stars、1.25 万 forks**，中文媒体首日报道 2.8 万–8 万星（如 [智东西](https://www.zhidx.com/p/584897.html)、[DoNews](https://www.donews.com/news/detail/4/6671983.html)）。说明刚完成公测放量，属于极早期但热度极高。
- **路线图**：**无独立 roadmap/vision 文档**（grep 无结果）。事实上的"路线图"是每个包 README 末尾的 **"Known Limitations and Deferred Work"** 段（如 webserver 的 TLS/auth、approval 的 allow-always、token-meter 的 CJK 低估等）。仓库文档体系自述处于 developer preview，"foundation over blast radius"（AGENTS.md：pre-release 期宁可破坏兼容也要做对地基）。
- **社区信号**：官方 GitHub Discussions、Discord 社区（README 提供链接）、`dsh-plugin` GitHub topic 鼓励第三方插件仓库；Cordis 设计论文 [A Programming Paradigm for Spatiotemporal Composability](https://github.com/cordiverse/paper)。

## 附：调研范围与不确定性

- 调研基于 master 分支浅克隆（depth 50，1587 commits，HEAD `47f943859`，2026-08-13），未运行构建/测试，结论均来自源码与文档通读。
- 未验证项：实际多实例并发行为（无文档）、Windows 沙箱完备性、SSE 传输的 MCP server 兼容（官方仅列 stdio/streamable-http）、OTA 升级路径（不存在）。
- 本地克隆保留在 `dsh-source/`（105MB），如需删除可随时清理。
