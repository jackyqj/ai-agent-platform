# 本地跑起来 · 完整指引

把平台（模型网关 + 控制面 + 任务 Worker + 两个 MCP Server + 商店 UI）在本地跑起来，体验完整闭环。

> 环境事实：macOS 宿主 Node v26.5.0 / pnpm 11.21；当前 `dsh-source/` 要求 Node `^24.22.3 || >=26.13.1` 和 pnpm `11.28.5`，运行 Worker 时需切换到符合要求的 Node。podman 容器运行时；`adaptix-postgres`（PG16）/`adaptix-redis` 已在运行。
> 模型：LiteLLM 网关（`configs/gateway/`，podman-compose 起，宿主端口 4001）做混合路由；云端路由 `cloud/deepseek` 走 DeepSeek 官方 `deepseek-v4-flash`（API key 用 `DS_API_KEY`，生产走 D20 密钥服务）；私有路由 `private/qwen-72b` 需 GPU/vLLM（D13）。
> 仓库布局（2025-08 迁移后）：控制面 `apps/control-plane`、知识库 MCP `services/mcp-kb`、数据库 MCP `services/mcp-db`、商店 UI `web/store`、迁移在 `apps/control-plane/migrations`。

## 0. 前置

```sh
node -v            # DSH: ^24.22.3 || >=26.13.1
pnpm -v            # dsh-source 要求 11.28.5；必要时 npm install -g pnpm@11.28.5
cd ..
podman info        # 容器运行时（需要能拉镜像/起容器）
# 模型密钥（网关/直连二选一；不写进任何文件，运行时 env 传递）
export NVIDIA_KEY='nvapi-...'   # 仅旧 NVIDIA 路径；当前默认 DeepSeek 官方（DS_API_KEY，见「模型网关」节）
export DEEPSEEK_API_KEY=''      # 云端 key；用 DS_API_KEY 的话无需再设（见 .env）
export PG_DSN='postgres://adaptix:adaptix_password@127.0.0.1:5432/control_plane'
```

## 1. 基础设施（PG/Redis/样例数据/迁移）

PG、Redis 已在 podman 中运行（adaptix 容器）。若本机没有，可用本仓库的 compose 起：
`docker compose -f <repo>/infra/compose.yml up -d`（见 infra/，包含 PG+Redis 镜像）。以下按"已有 adaptix 容器"继续：

```sh
# 迁移（幂等，可重复执行）——迁移脚本在控制面包内
CONTAINERS_CONF=... podman exec -i adaptix-postgres psql -U adaptix -d control_plane \
  < apps/control-plane/migrations/001_init.sql
... 002_tasks.sql ... 003_approvals.sql ... 004_quota.sql ... 005_scheduled_tasks.sql ... 006_secrets.sql ... 007_users.sql ... 008_agent_composition.sql ... 009_quota_alerts.sql ... 010_scheduled_extra.sql ... 011_role_definitions.sql ... 012_multilevel_approval.sql ... 013_quota_policy_unique.sql ... 014_composite_catalog.sql ... 015_graph_revisions.sql
# 样例数据（试点报表场景）
podman exec -i adaptix-postgres psql -U adaptix -d control_plane \
  < services/mcp-db/seed.sql   #（或按 mcp-db README 手建 demo_sales）
```

## 2. 启动控制面（API 网关/认证/会话/商店/审批/任务入口）

```sh
cd apps/control-plane
npm install
npm run build          # ⚠️ 必须用 tsc 构建产物启动（npm start）；不要用 `tsx src/main.ts` 跑 dev——
                       # tsx(esbuild) 不发射 decorator 元数据，Nest 构造注入会全部变 undefined（详见"已知注意点 5"）
DATABASE_URL="$PG_DSN" node dist/main.js
# → listening on http://127.0.0.1:4000 (auth=dev, orch=memory)
```

dev 登录（本地演示）：`GET /api/auth/dev/login?userId=u-admin`（或 u-dev-1 / u-hr-1）→ 返回 JWT。

### 2.5 钉钉 SSO + IM 机器人（07/18 工单，可选）

```sh
# 认证切钉钉（生产模式）：授权 URL 302 → 钉钉 → 回调换票（需在钉钉后台配置「登录回调域名」）
export CP_AUTH_MODE=oidc
export CP_OIDC_CLIENT_ID='ding...'  CP_OIDC_CLIENT_SECRET='...'
export CP_OIDC_REDIRECT_URI='http://<控制面域名>/api/auth/sso/callback'

# IM 机器人（Stream 模式；默认复用 CP_OIDC_* 凭证，也可用 CP_DINGTALK_* 单独指定）
# 控制面启动后自动建立长连接（日志出现「钉钉 Stream 已连接」即在线）
```

排障/演示（无需真实钉钉群）：
```sh
curl -H "Authorization: Bearer $ADMIN_JWT" http://127.0.0.1:4000/api/admin/im/status
# → {"enabled":true,"streamConnected":true,"tracked":0,...}
curl -X POST -H "Authorization: Bearer $ADMIN_JWT" -H "Content-Type: application/json" \
  -d '{"text":"公司请假的制度是什么？","sessionWebhook":"http://127.0.0.1:4100/sink"}' \
  http://127.0.0.1:4000/api/admin/im/simulate   # sessionWebhook 指向自建 sink 可捕获回推
```

## 3. 模型网关（LiteLLM，03 工单；推荐）

模型统一走网关混合路由（私有 vLLM + 云端 API），DSH/运行时只连网关这一个 OpenAI 兼容端点。

```sh
cd configs/gateway
# 密钥（云端路由可直接用 apps/control-plane/.env 里的 DS_API_KEY；不落盘明文）
export LITELLM_MASTER_KEY="sk-lm-master-$(openssl rand -hex 8)"   # 网关管理密钥
export DEEPSEEK_API_KEY="$DS_API_KEY"                             # 云端 DeepSeek（可用你的 DS_API_KEY）
# export DASHSCOPE_API_KEY=sk-...                                 # 可选：cloud/qwen-plus 路由
export LITELLM_PORT=4001                                          # 宿主端口，避开控制面 4000
# 私有路由（有独立 Qwen 才配；无 GPU 就只起 litellm）
# export VLLM_BASE_URL='http://<你的Qwen服务>:8000/v1'  export VLLM_MODEL='Qwen/Qwen2.5-72B-Instruct'  export VLLM_API_KEY=...

podman-compose up -d litellm     # 云端优先；GPU 就绪后再 up -d vllm

# 校验
curl -s http://127.0.0.1:${LITELLM_PORT:-4001}/v1/models -H "Authorization: Bearer $LITELLM_MASTER_KEY"
curl -s http://127.0.0.1:${LITELLM_PORT:-4001}/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H "Content-Type: application/json" \
  -d '{"model":"cloud/deepseek","messages":[{"role":"user","content":"你好"}]}'
```

> 要点：容器内固定监听 4000，宿主端口由 `LITELLM_PORT` 决定（默认 4001，避免与控制面 4000 冲突）。
> DSH 侧若与网关同网络用 `http://litellm:4000/v1`，否则用宿主地址 `http://127.0.0.1:${LITELLM_PORT:-4001}/v1`。
> **鉴权**：网关 master key 独立（不要复用 `DS_API_KEY`）；把 `LITELLM_MASTER_KEY` 作为 `GATEWAY_KEY` 写入 D20 vault
> （`curl -X PUT http://127.0.0.1:4000/api/admin/secrets/GATEWAY_KEY -H "Authorization: Bearer $ADMIN_JWT" -d '{"value":"<master>"}'`），
> 交互实例与任务 Worker 都通过 `llm-pi-ai` 的 `gateway` route 使用该引用；Worker 的 `llm-deepseek` route 保留给官方直连。

## 4. 启动任务 Worker（真实执行 Agent 任务）

```sh
cd dsh-source/apps/task-worker   # DSH prefix 上的 Vendor overlay（见 GLOSSARY.md）
export DSH_HOME="$REPO_ROOT/.dsh-home"
export DATABASE_URL="$PG_DSN"
# cloud/* 与 private/* 经 LiteLLM gateway；其他模型 id 使用官方 DeepSeek route。
# 默认 cloud/deepseek + http://127.0.0.1:4001/v1；网关 key 从 D20 vault 按请求解析。
export DSH_MODEL="${DSH_MODEL:-cloud/deepseek}"
# 直连示例：DSH_MODEL=deepseek-flash（使用 DEEPSEEK_API_KEY / DS_API_KEY）
./node_modules/.bin/tsx src/worker.ts
# → [worker] ready (..., model=cloud/deepseek)
```

Worker 会通过新版 DSH SDK 拉起 JSON-RPC 运行时并加载 `worker.cordis.yml`，其中挂载知识库/数据库两个 MCP Server。

## 5. 启动商店 UI（Vite + React + TS）

```sh
cd web/store
npm install
npm run dev          # Vite 开发服务器 → http://127.0.0.1:5377
# /api 由 Vite 代理到 http://127.0.0.1:4000（无需 CORS）
# 森米工作台（市集入口）：http://127.0.0.1:5377/
# 管理后台：http://127.0.0.1:5377/#admin（u-admin 登录后侧栏「管理」）
# admin.html 保留为跳转兼容页
```

> UI 结构（`src/`）：`store-client.ts`（类型化 HTTP 访问，领域方法）、`useApp.ts`（状态 + actions）、
> `App.tsx`/`StoreView.tsx`/`ChatView.tsx`/`AdminView.tsx`（视图）、`types.ts`（领域类型）、`styles.css`（珊瑚橙 / 奶油底，对齐 `docs/design-proposals/xiaobien-dsh-ui/ab.html`）。
> 测试：`npm test`（Vitest + React Testing Library）。构建：`npm run build` → `dist/`
> （静态产物需由同一 origin 反代 `/api` 到 `:4000`）。

## 6. 演示流程

### A. 市集浏览与开始使用
- UI 里输入 `u-admin` → 登录
- Agent 市集显示可见 Agent 卡片（模型路由徽标/审批级别）
- 点「开始使用」进入对话工作台（回市集可换 Agent）

### B. 员工提审 → admin 批准（12 工单）
- 提审区填 id/名称/描述/basedOn → 提交 → `draft`
- 员工列表看不到 draft；admin 在「全部 Agent」里批准 → preset 文件生成到 `$DSH_HOME/presets-company/<id>/` + 上架 → 立即可见

### C. 任务 + 审批门（14 工单）
```sh
# 1) 建 API key（内部系统触发身份）
curl -X POST http://127.0.0.1:4000/api/admin/api-keys \
  -H "Authorization: Bearer $ADMIN_JWT" -H "Content-Type: application/json" \
  -d '{"name":"demo","scopes":["task:create"]}'        # 返回 apiKey（仅一次）
# 2) 触发 report-builder 任务（approvalLevel=self → 先进审批，不入队）
curl -X POST http://127.0.0.1:4000/api/service/trigger \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"task":"用 demo_sales 库查各区域销售总额","agentPresetId":"report-builder"}'
# → accepted + taskId；任务 queued 但未入队（worker 无动静）
# 3) UI 管理区「待审批」→ 批准 → 任务入队执行（数分钟，NVIDIA 模型较慢）
# 4) 同 key 同任务再触发 → 授权存储命中（24h）→ 直接入队，不再审批
```

### D. 直接查任务状态
```sh
curl http://127.0.0.1:4000/api/admin/tasks -H "Authorization: Bearer $ADMIN_JWT"
# done 的任务 result.finalResponse 是模型最终回答；审计链在 audit_events 表
```

### E. 管理后台 v1（10 工单）
- 打开 http://127.0.0.1:5377/#admin，用 `u-admin` 登录（或侧栏「管理」导航）
- **3 步找会话**：用户表点「会话」→ 会话表点一行 → 下方事件摘要
- 禁用 `u-hr-1`：其实例立即回收；该用户再调 API 返回 401 `user disabled`
- 模型配置为只读展示（03 网关已在 4001 部署；管理后台 v1 的模型配置暂为只读，未接网关流量配置）；审计区可按 userId / sessionId / eventType 过滤

### F. 集中凭据 HTTP resolve（09 工单）
- 交互 Web 实例**不持** `SECRETS_MASTER_KEY` / `CP_JWT_SECRET`；按请求 `GET /api/internal/secrets/:ref`（`X-API-Key` + scope `secrets:resolve`）
- Worker 仍直连 PG vault（可信进程持主密钥）
- 审计：`eventType=secrets.resolve`，payload 只有 `ref` / `source` / `configured`（无明文）
- podman 容器把 `CP_SECRETS_URL` 设成宿主机可达地址（如 `http://host.containers.internal:4000/api/internal/secrets`）

## 7. 常用配置（env）

| 变量 | 默认 | 说明 |
|---|---|---|
| `CP_PORT` | 4000 | 控制面端口 |
| `CP_AUTH_MODE` | dev | `oidc` 走钉钉（需 `CP_OIDC_*`） |
| `CP_OIDC_CLIENT_ID` / `CP_OIDC_CLIENT_SECRET` | — | 钉钉企业内部应用凭证（SSO 换票） |
| `CP_OIDC_REDIRECT_URI` | `http://127.0.0.1:4000/api/auth/sso/callback` | 钉钉回调（须在钉钉后台登记域名） |
| `CP_DINGTALK_CLIENT_ID` / `CP_DINGTALK_CLIENT_SECRET` | 复用 `CP_OIDC_*` | IM 机器人凭证（Stream 模式） |
| `CP_ORCHESTRATOR` | memory | `docker` 时用 podman 起真实 DSH Web 容器（需 `CP_DSH_WEB_IMAGE`） |
| `CP_TASK_TIMEOUT_MS` | 300000 | 任务超时（多轮工具任务建议 600000） |
| `CP_TASK_ATTEMPTS` / `CP_TASK_BACKOFF_MS` | 3 / 3000 | 任务重试 |
| `CP_WORKER_CONCURRENCY` | 2 | worker 并发（同用户串行不受影响） |
| `CP_PRESET_ROOT` | `$DSH_HOME/presets-company` | 商店 preset 文件根 |
| `CP_GRANT_HOURS` | 24 | 授权存储「记住 X 小时」 |
| `SECRETS_MASTER_KEY` | （回退 JWT） | vault 主密钥；**只给控制面与 worker**，不进交互容器 |
| `CP_SECRETS_TOKEN` | dev: `cp_dev_secrets_resolve` | 实例 HTTP resolve 的 API key（scope `secrets:resolve`） |
| `CP_SECRETS_URL` | `http://127.0.0.1:$CP_PORT/api/internal/secrets` | 容器内 resolve 基址；docker/podman 需改成宿主机可达 URL |

## 8. 停止与清理

```sh
pkill -f "node dist/main.js"; pkill -f "tsx src/worker.ts"; pkill -f "http.server 8080"
cd configs/gateway && podman-compose down        # 模型网关（litellm/vllm）
# 演示数据保留在 PG（tasks/approval_requests/agent_presets）；清库可 TRUNCATE 或重建 control_plane 库
```

## 已知注意点（2025-08-19 实测记录）

1. **模型工具调用合规性**：早期 `deepseek-v4-flash-0731`（NVIDIA NIM）行为不稳定——部分轮次"假装调用工具、编造输出"（会话事件 tool/call=0），已弃用。当前默认 DeepSeek 官方 `deepseek-v4-flash`（经网关 `cloud/deepseek` 路由），预期更稳；若仍遇编造，换模型（llama-3.3-70b 或私有 Qwen，`private/qwen-72b`）或加强 persona。私有 Qwen（D13）到位后应回归此测（03 工单）。
2. **多轮工具任务耗时**：3-5+ 分钟（慢模型×多轮）；默认 5min 超时可能不够，建议 `CP_TASK_TIMEOUT_MS=600000`。
3. **同用户串行**：per-worker 进程内保证；多 worker 部署需 per-user 队列分区（当前单 worker 假设）。
4. **沙箱环境**（本机开发）：`DSH_HOME` 指到工作区内的 `.dsh-home`。
5. **控制面 dev 脚本不可用**：`npm run dev`（tsx watch）会因 tsx/esbuild 不发射 `design:paramtypes` 装饰器元数据导致全部构造注入为 undefined（表现为 `Cannot read properties of undefined (reading 'pool')` 之类的启动崩溃）。**一律 `npm run build && npm start`**（tsc 产物）。
6. **钉钉回调域名**：SSO 浏览器授权前，须在钉钉开发者后台为应用配置「登录回调域名」（指向控制面 `/api/auth/sso/callback` 的域名）；Stream 机器人无需回调域名，但需在「应用能力-机器人」开通 Stream 模式并发布，且机器人要拉进群后才能收到 @消息。
