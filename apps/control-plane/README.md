# 控制面骨架（06/07 工单）

位置：`.scratch/ai-agent-platform/phase1/control-plane/`
技术栈（D9）：Node/TS + NestJS（Fastify 适配器）
范围：认证/角色（07）+ 会话/实例编排/路由代理/审计（06）

## 架构总览

```
浏览器/内部系统 → [AuthGuard: JWT + 角色] → /api/*（控制面业务）
                                      └→ /proxy/:sessionId/*（实例代理）
                                            三重校验：JWT → 会话归属 → routing_secret
                                            转发到用户 DSH Web 实例（loopback 容器）
```

| 模块 | 路径 | 职责 |
|---|---|---|
| auth | `src/auth/` | dev 登录（本地）/ 钉钉 OIDC 流程（openid-client）+ 平台 JWT 签发 |
| keys | `src/keys/` | **服务身份 API Key（07）**：签发（明文一次）/sha256 校验/scope 守卫/撤销 + `POST /api/service/trigger` 占位 |
| users | `src/users/` | 用户/角色（部门标签驱动 D12）+ 本地覆盖 |
| sessions | `src/sessions/` | 会话 ↔ 实例映射，routing_secret 签发，**PG 持久化（08，重启可恢复）** |
| instances | `src/instances/` | 编排器接口 + memory（开发）+ container（podman/docker）实现，**生命周期落 PG（08）** |
| agents | `src/agents/` | Agent 目录读侧（商店骨架，12 工单完整实现） |
| audit | `src/common/audit.store.ts` + `src/audit/` | 审计：PG（DATABASE_URL）或内存回退，fail-soft |
| proxy | `src/proxy/` | 实例代理：三重校验 + 状态码/content-type 透传 |
| store | `src/store/pg.store.ts` | PG 访问（audit/sessions/instances/api_keys 仓库） |
| migrations | `migrations/001_init.sql` | 7 张表：departments/users/sessions/instances/audit_events/api_keys/agent_presets |

## 运行

```sh
npm install --cache <workdir>/.npm-cache   # 沙箱：npm 缓存指到工作区
npm run build

# 开发模式（内存编排 + 内存审计）
node dist/main.js

# 生产形态（容器编排 + PG 审计）——本环境已实测：
DATABASE_URL='postgres://adaptix:adaptix_password@127.0.0.1:5432/control_plane' \
CP_ORCHESTRATOR=docker CP_DSH_WEB_IMAGE=company-dsh-web:latest CP_CONTAINER_CMD=podman \
node dist/main.js
```

环境变量见 `.env.example`。PG 迁移：`psql -U adaptix -d control_plane -f migrations/001_init.sql`。Skill 市场（24 工单）在 016–020：

```sh
psql -U adaptix -d control_plane -f migrations/016_skills.sql
psql -U adaptix -d control_plane -f migrations/017_skill_feedback.sql
psql -U adaptix -d control_plane -f migrations/018_change_requests.sql
psql -U adaptix -d control_plane -f migrations/019_notifications.sql
psql -U adaptix -d control_plane -f migrations/020_skill_draft.sql
```

## 冒烟流程（已验证）

```sh
# 登录 → JWT
curl -s 'http://127.0.0.1:4000/api/auth/dev/login?userId=u-admin'
# 建会话（docker 编排 → 懒启动容器实例，健康检查通过置 ready）
curl -s -X POST http://127.0.0.1:4000/api/sessions -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{}'
# 代理转发（JWT + routing_secret 双头）
curl -s http://127.0.0.1:4000/proxy/$SID/healthz -H "Authorization: Bearer $TOK" -H "x-routing-secret: $RS"
# 审计查询（PG）
curl -s 'http://127.0.0.1:4000/api/admin/audit/events?limit=10' -H "Authorization: Bearer $TOK"
```

## 2025-08-16 验证结果

- [x] JWT 签发/校验 + 角色守卫（employee 访问 admin 路由 → 403）
- [x] 会话创建 → **真实容器懒启动**（podman，busybox 模拟 DSH Web 实例镜像）
- [x] 健康检查（容器 /healthz 通过 → status=ready）
- [x] 代理三重校验：错误 secret → 403；他人会话 → 403；正确 → 200 透传
- [x] 审计落 **PostgreSQL**（login/create/forward/denied/close 全量）
- [x] 会话关闭 → 容器销毁（零残留）
- [x] **08 会话持久化：控制面重启后会话/实例从 PG 恢复**
- [x] **07 服务身份 API Key**：签发/校验/scope/撤销/哈希落库全链路
- [x] 发现 Node 26 正则 `$` 不再匹配末尾换行前（需先 trim 再匹配）——已记录到代码注释

## DSH 侧共享会话存储（08，`dsh-source/packages/session/session-persistence-pg/`）

控制面元数据落 PG 之外，Agent 会话事件本体也已可用 PG 持久化：
- 平台自有 Provider（移植 SQLite 后端：append-only、seq 连续、崩溃收尾、事务原子性）
- headless 实测：无模型 key 时模型调用失败，但**会话行 + 8 条事件（含 user/message 原文）已持久化**到 `dsh_sessions` schema
- 公司 profile 已接线（02 工单 patch：禁用 jsonl + 插入 pg，url 走 `SESSION_PG_URL` env）
- 注意：平台自有包，未跑上游门禁（覆盖率/invariants/doc-sync），非上游 PR 提交物

## 待办（Phase 1 后续）

- 钉钉 OIDC 真实接入：需钉钉应用凭证（`CP_OIDC_*`），`AUTH_MODE=oidc` 的流程已实现待验证
- 组织架构定时同步（07 交付物：全组织只读同步 → users 表 upsert）
- sessions/instances 落 PG（当前内存 Map；08 工单的 SessionPersistence 与此合并设计）
- 代理补 POST/WebSocket 升级（当前仅 GET；Web UI 交互需要）
- 真实 company-dsh-web 镜像（02 profile 构建产物，非 busybox 模拟）
- 服务身份 API Key（07 交付物：api_keys 表已建，签发/校验待实现）
