# 工单状态回归快照（2026-08-20）

> 全部 23 张工单仍为 `open`（里程碑验收需真人参与/模型 key 场景）。以下为**已完成技术工作**的回归记录，
> 按「完成度 → 遗留」分类。更新日期 2026-08-20。

## ✅ 技术链路已完成（核心闭环实测）

| 工单 | 完成内容 | 实测证据 | 遗留 |
|---|---|---|---|
| 01 开发环境 | 源码构建/CLI/dump-config/web 冒烟/headless | install 41.5s + build；web HTTP 200；MCP 挂载 | 模型 key 已解锁（NVIDIA）；测试 key 建议轮换 |
| 02 公司 profile | persona/模型路由/presets 根/MCP 行/共享存储接线 | dump-config 组合正确 | 网关路由切换（等 03）、危险工具收敛（13） |
| 04 首个 MCP Server | company-mcp-kb（stdio） | SDK 冒烟 + DSH 挂载 + M0 工具调用 | streamable-http 服务化（SDK Node26 已知问题） |
| 06 控制面骨架 | 认证/会话/实例编排（podman 真容器）/代理三重校验/审计 | 登录→容器→ready→转发→审计→回收全闭环 | 实例落 PG 已完成（08）；WebSocket 升级 |
| 07 SSO 网关 | 平台 JWT/角色守卫/API Key 服务身份；**钉钉 OAuth 原生接入真验**（授权 URL 302 / CSRF state 校验 / 换票端点直连，错误透传"不合法的临时授权码"） | employee→admin 403；key 签发/撤销/scope 全验；SSO 302→钉钉；callback 401 干净 | 浏览器真授权（需配置回调域名）、组织架构同步 |
| 08 共享会话存储 | 控制面元数据落 PG + DSH SessionPersistence PG Provider | 重启恢复；事件链入 PG；**71/71 测试 + 覆盖率 100%** | 跨实例续聊验收；doc-sync 等上游门禁 |
| 12 Agent 商店 | 4 个真实 preset + 目录服务（PG）+ 提审流程 + 静态 UI | dsh-agent-presets 发现全过；draft→批准→文件生成→上架 | 前端商店 UI 已出静态版（无构建）；配额档（16） |
| 14 审批流 | 授权存储 + 任务前置审批门 | 触发→pending→批准→入队；授权存储命中 | 多级审批、DSH 原生 seam 深层挂钩 |
| 19 任务队列 | BullMQ + Worker（TS SDK 驱动运行时）+ 可靠性五件套 | 触发→执行→done；重试 3/3/超时/取消/串行/孤儿全验 | 步骤级轨迹（用户已决定不补）、IM/回调 |
| 09 集中凭据 | PG AES-256-GCM vault + admin API + bootstrap + `dsh-credentials-pg`（PG 或 HTTP resolve）+ 每次 resolve 审计 | 单测：vault 优先/轮换/describe 无明文；HTTP 不持主密钥；resolve 审计无明文 | 容器 DNS（`host.containers.internal`）；worker 直连 PG 的 resolve 不经控制面；网关密钥等 03 |
| 10 管理后台 v1 | 静态管理页 + 用户启用/禁用（立即回收实例、JWT 拒绝）+ 管理员会话检索/事件摘要 + 实例回收 + 只读模型配置 + 审计查询 | 单测：disable/patch、admin list 无 routing_secret、closeAll 回收实例、sessionId 审计过滤 | 网关未部署故模型配置只读；未做 React 门户 |
| 13 RBAC | 权限点全量应用到管理端点 + 拒绝审计；角色→DSH_PERMISSION_MODE；部门 overlay；**users 落 PG**（禁用/角色覆盖跨重启）+ **自定义角色**（role_definitions 表：角色名+权限点集合+DSH preset；守卫/权限策略接入；管理后台角色管理；可指派给用户） | 单测：preset 解析/部门覆盖、employee 拒 user.manage 并留痕；disable/override 经同一 store 重启仍在 | 组织架构定时同步（07） |

## 🟡 部分完成（部署包/材料就绪，待资源或真人）

| 工单 | 现状 | 阻塞 |
|---|---|---|
| 03 模型网关 | LiteLLM compose + 混合路由配置就绪；**私有路由 env 化（Qwen 端点即插即用）** | 云端路由密钥、网关实际部署验收 |
| 05 试点运行 | 材料包（指引/样例/反馈模板）就绪；**M0 已达成**（工具调用端到端） | **种子用户名单**、真人试用 |

## ⬜ 未开始（后续阶段）

| 工单 | 阶段 | 前置 |
|---|---|---|
| 11 试点扩量 | Phase 1 | 05 试点结果 |
| 15 审计看板 | ✅ 用量聚合 API + 看板 UI（任务/失败/Agent/配额/错误） | token 成本口径 + OTel 全链路（等 03 网关/日志平台） |
| 16 配额限流 | ✅ 配额核心（策略/用量/任务前置门，429 实测）+ 管理 UI 面板 + **warn 告警闭环**（quota_alerts 落库可处置 + 审计 quota.warn + 管理后台一键处置）+ **部门级策略**（submit 传 dept，user→dept→all 生效）+ **warn 放行/reject 拦截**（blocked 信号） | token/成本记账（等 03 网关） |
| 17 RAG 升级 | ✅ 语义检索 v1（NVIDIA embedding + 向量索引，自然问法实测命中） | 真实文档接入；pgvector/bge-m3 替换；rerank v2 |
| 18 IM 机器人 | **✅ Stream 模式机器人实连 + 桥接全链路**：官方 SDK 长连接（真实凭证 connected=true）、@消息→身份解析→preset 路由→任务入队→受理回执→终态主动推送（sink 捕获实测）；敏感操作分层守卫（8/8 单测） | im/status 在线；simulate 路由/入队/回推全通 | 真实群 @ 验收（需把机器人拉进群）、worker 执行质量（等 Qwen 回归） |
| 20 定时 Agent | ✅ 调度器 + 定时任务 API（tick/run-now/暂停/审批门实测）+ **时区**（任务级 timezone）+ **完整 cron**（5 段 cron，cron-parser）+ **执行失败告警**（scheduled_run_logs + last_run_status + 审计 scheduled.failure + 管理面失败列表） | 与 18 IM 的结果推送联动（等真实群验收） |
| 21 工作流模板 | ✅ 运行时装配（workflow/subagent 全套）+ 3 个模板库；管线通 | 完整端到端验证（等 Qwen 回归）；模板引用接线 |
| 22 反馈闭环 | Phase 3 | 试点数据 |
| 23 全量推广 | Phase 3 | 试点结果 + 培训材料 |

## 关键决策已定（map.md D1–D21）

钉钉 SSO / Node+TS 控制面 / Docker 起步 / LiteLLM / PG 单库多 schema / 审计 180 天 /
pgvector+bge-m3 / 数据分级路由强制 / 试点 4 场景 / 自建密钥服务 / **PG Provider 平台自有（D21，待正式版后重评）**。

## 待真人/外部（4 项）

1. 试点人选名单（D19 构成）——阻塞 05/11
2. 安全评审对接人（D18）
3. **真实群 @ 验收**（把机器人拉进钉钉测试群；Stream 凭证已在 vault）
4. 私有 Qwen 端点（可选；当前走 DeepSeek 官方 `deepseek-v4-flash`）

> 注：NVIDIA 测试 key 已停用；模型密钥走 D20 vault（`.env` 的 `DS_API_KEY` 仅 bootstrap）。
