# 本地跑起来 · 完整指引

把平台（控制面 + 任务 Worker + 两个 MCP Server + 商店 UI）在本地跑起来，体验完整闭环。

> 环境事实：macOS，Node v26.5.0，pnpm 11.21；podman 容器运行时；`adaptix-postgres`（PG16）/`adaptix-redis` 已在运行。
> 模型：NVIDIA OpenAI 兼容端点（`deepseek-ai/deepseek-v4-flash-0731`），API key 由你提供（生产走 D20 密钥服务）。
> 仓库布局（2025-08 迁移后）：控制面 `apps/control-plane`、知识库 MCP `services/mcp-kb`、数据库 MCP `services/mcp-db`、商店 UI `web/store`、迁移在 `apps/control-plane/migrations`。

## 0. 前置

```sh
node -v            # ^22.19 || >=24
pnpm -v            # >=11.7
podman info        # 容器运行时（需要能拉镜像/起容器）
# NVIDIA key（模型调用用；不写进任何文件，运行时 env 传递）
export NVIDIA_KEY='nvapi-...'   # 仅旧 NVIDIA 路径；当前默认 DeepSeek 官方（DS_API_KEY）
export PG_DSN='postgres://adaptix:adaptix_password@127.0.0.1:5432/control_plane'
```

## 1. 基础设施（PG/Redis/样例数据/迁移）

PG、Redis 已在 podman 中运行（adaptix 容器）。若本机没有，可用本仓库的 compose 起：
`docker compose -f <repo>/infra/compose.yml up -d`（见 infra/，包含 PG+Redis 镜像）。以下按"已有 adaptix 容器"继续：

```sh
# 迁移（幂等，可重复执行）——迁移脚本在控制面包内
CONTAINERS_CONF=... podman exec -i adaptix-postgres psql -U adaptix -d control_plane \
  < apps/control-plane/migrations/001_init.sql
... 002_tasks.sql ... 003_approvals.sql ... 004_quota.sql ... 005_scheduled_tasks.sql ... 006_secrets.sql
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

## 3. 启动任务 Worker（真实执行 Agent 任务）

```sh
cd dsh-source/packages/platform/task-worker   # dsh-source 为仓库内 vendor 源码
export DSH_HOME="$REPO_ROOT/.dsh-home"
export DATABASE_URL="$PG_DSN"
# 模型密钥由 D20 vault 按请求解析（.env 的 DS_API_KEY 启动时写入 vault）：
# worker 把 DATABASE_URL + SECRETS_MASTER_KEY 传给运行时，不再注入 DEEPSEEK_API_KEY
export DEEPSEEK_BASE_URL="${DEEPSEEK_BASE_URL:-https://api.deepseek.com}"
export DSH_MODEL="${DS_API_MODEL:-deepseek-v4-flash}"
./node_modules/.bin/tsx src/worker.ts
# → [worker] ready (..., model=deepseek-v4-flash)
```

Worker 会拉起 DSH 运行时（`dsh-jsonrpc-agent` bin + `worker.cordis.yml`，内含知识库/数据库两个 MCP Server）。

## 4. 启动商店 UI

```sh
cd web/store
python3 -m http.server 8080 --bind 127.0.0.1
# 商店：http://127.0.0.1:8080/index.html
# 管理后台：http://127.0.0.1:8080/admin.html（u-admin 登录；CORS 已放行）
```

## 5. 演示流程

### A. 商店浏览与选用
- UI 里输入 `u-admin` → 登录
- Agent 商店显示可见 Agent 卡片（模型路由徽标/审批级别）
- 点「选用」→ 显示 sessionId + routingSecret（代理路由用）

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
- 打开 http://127.0.0.1:8080/admin.html，用 `u-admin` 登录
- **3 步找会话**：用户表点「会话」→ 会话表点一行 → 下方事件摘要
- 禁用 `u-hr-1`：其实例立即回收；该用户再调 API 返回 401 `user disabled`
- 模型配置为只读（03 网关未部署）；审计区可按 userId / sessionId / eventType 过滤

## 6. 常用配置（env）

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

## 7. 停止与清理

```sh
pkill -f "node dist/main.js"; pkill -f "tsx src/worker.ts"; pkill -f "http.server 8080"
# 演示数据保留在 PG（tasks/approval_requests/agent_presets）；清库可 TRUNCATE 或重建 control_plane 库
```

## 已知注意点（2025-08-19 实测记录）

1. **模型工具调用合规性**：deepseek-v4-flash-0731（NVIDIA）行为不稳定——部分轮次"假装调用工具、编造输出"（会话事件 tool/call=0）。管线与工具注册正常；若遇到编造答案，换模型（llama-3.3-70b 或私有 Qwen）或加强 persona。这是试点前需解决的模型选型问题（D13 GPU 到位后回归）。
2. **多轮工具任务耗时**：3-5+ 分钟（慢模型×多轮）；默认 5min 超时可能不够，建议 `CP_TASK_TIMEOUT_MS=600000`。
3. **同用户串行**：per-worker 进程内保证；多 worker 部署需 per-user 队列分区（当前单 worker 假设）。
4. **沙箱环境**（本机开发）：`DSH_HOME` 指到工作区内的 `.dsh-home`。
5. **控制面 dev 脚本不可用**：`npm run dev`（tsx watch）会因 tsx/esbuild 不发射 `design:paramtypes` 装饰器元数据导致全部构造注入为 undefined（表现为 `Cannot read properties of undefined (reading 'pool')` 之类的启动崩溃）。**一律 `npm run build && npm start`**（tsc 产物）。
6. **钉钉回调域名**：SSO 浏览器授权前，须在钉钉开发者后台为应用配置「登录回调域名」（指向控制面 `/api/auth/sso/callback` 的域名）；Stream 机器人无需回调域名，但需在「应用能力-机器人」开通 Stream 模式并发布，且机器人要拉进群后才能收到 @消息。
