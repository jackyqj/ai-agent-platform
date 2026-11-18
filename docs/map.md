# 平台建设地图（ai-agent-platform）

## Notes

- 目标：公司内部 AI Agent 使用平台，50–500 人，综合平台（员工助手 + 业务自动化）
- 技术路线：基于 DeepSeek Harness（DSH）扩展，不 fork 内核，围绕能力缝做平台层
- 关键文档：`spec.md`（架构与路线图）、`enterprise-shell.md`（外壳/控制面设计：§3 模块、§4 数据模型、§7 接口契约、§8 开发顺序）、`research-report.md`（DSH 企业适配调研，131 行含包级证据）
- 版本现状：DSH `0.1.3-alpha.1`（**仓库内 vendor 源码 `dsh-source/`**，2026-09-05 对齐 tag `dsh-v0.1.3-alpha.1`；上游 https://github.com/deepseek-ai/deepseek-harness，指针见 `dsh-source/VENDOR.md`）；pre-release，README 明示破坏性变更
- 时间线：3 个月以上，4 个阶段（Phase 0–3），14+ 周；先试点后推广
- 团队：2–3 名 AI 工程师（JD 主体）+ 1–2 名平台工程师 + 1 名前端 + 架构师/产品各 1（可兼）

## Decisions-so-far

| # | 决策 | 结论 | 出处 |
|---|---|---|---|
| D1 | 多用户模型 | JSON-RPC 运行时池（员工交互 + 自动化）；每用户 Web 实例降为远期工作室。不做多租户内核改造 | spec ADR-1，被 **D22** 修正 |
| D2 | 认证 | 反代 SSO 前置（企微/钉钉/飞书），DSH 实例保持无认证，只监听 loopback | spec ADR-2 |
| D3 | 模型策略 | 模型网关统一 OpenAI 兼容端点，私有 vLLM + 云端 API 混合路由 | spec ADR-3 |
| D4 | RAG | 自建 RAG MCP Server，不侵入内核；权限过滤在服务端 | spec ADR-4 |
| D5 | 会话存储 | 按能力缝实现 PostgreSQL 版 `SessionPersistence`，附件走对象存储 | spec ADR-5 |
| D6 | Agent 目录 | DSH preset + 平台级「Agent 商店」目录服务（上架/下架/可见性） | spec ADR-6 |
| D7 | 内核边界 | 平台层只依赖能力缝接口，不碰内部实现；锁版本跟随上游 | research-report §7 |
| D8 | SSO 首发 | **钉钉** OIDC（oauth2-proxy；企微/飞书为配置项） | 2025-08-16 评审 |
| D9 | 控制面技术栈 | **Node/TS + NestJS（Fastify）**；运行时驱动用官方 `@deepseek-ai/dsh-sdk-client`（TS SDK） | 2025-08-16 评审 |
| D10 | 部署形态 | **Docker 起步**，编排接口抽象预留 K8s 平移 | 2025-08-16 评审 |
| D11 | 模型网关 | **LiteLLM** 部署（混合路由/配额/密钥集中） | 2025-08-16 评审 |
| D12 | 组织架构→角色 | **全组织同步 + 部门标签驱动**：IT/研发=developer、指定部门=admin、其余=employee；本地覆盖表做例外 | Q1 评审 |
| D13 | 私有模型硬件 | **GPU + Qwen 本地模型已部署**（2025-08-18 用户完成）；网关私有路由 env 化（VLLM_BASE_URL/VLLM_MODEL）即插即用 | Q2 评审 / 2025-08-18 更新 |
| D14 | 设施复用 | 有**日志平台**（OTel 直接对接）+ 有**对象存储**（S3）；无 K8s（Docker 兑现）；**无 KMS**（凭据 Provider 自建或对接，待确认）；CI/CD 未确认 | Q3 评审 |
| D15 | 会话存储 | **单库多 schema 起步**（session_events/platform_meta/audit），预留分表迁移路径 | Q4 评审 |
| D16 | 审计保留 | **180 天** | Q4b 评审 |
| D17 | RAG 选型 | **pgvector + 私有 bge-m3**；首批=制度文档 + FAQ + 一个业务部门资料 | Q5 评审 |
| D18 | 合规红线 | **数据分级**（公开/内部/机密）+ 机密钉死私有路由（网关兜底拒绝云端）；审计默认全量脱敏；安全评审 IT/安全牵头 | Q6 评审 |
| D19 | 试点 | 跨 2–3 部门 5–10 人（HR/行政 3 + 业务 3 + 研发/数据 2–4）；首批 4 场景：**制度/HR 问答、报销/财务流程、数据查询报表、研发文档检索** | Q7 评审 |
| D20 | 密钥服务 | **自建轻量密钥服务**（PG 加密存储起步，实现 `dsh-credentials` Provider 对接；不依赖公司 KMS） | 2025-08-16 确认 |
| D21 | PG Provider 定位 | **平台自有**（已契约级验证 54/54）；**待 DSH 首个 tagged release（接口冻结）后重新评估是否贡献上游**（届时补 100% 覆盖率等门禁） | 2025-08-18 确认 |
| D22 | 逻辑 RPC 会话 | 产品运行时是 JSON-RPC 任务池；员工 `POST /sessions` 只建逻辑会话（`type='rpc'`、无 `instanceId`），**不拉 DSH Web 实例、不占 `maxConcurrentInstances`**。Web 实例降为可选「工作室」（本轮不实现入口） | 2026-08-27 架构评审方案 A / spec |

## Fog（待定问题，执行前需解答）

> 集中评审材料见 `fog-review.md`（Q1–Q7 已评审完毕，见决策 D12–D19）；以下为评审后剩余的**执行级**待办。

- [ ] 试点人选名单：各部门推荐 5–10 人（对应 D19 构成）
- [ ] 安全评审对接人确认（IT/安全部门，对应 D18）
- [ ] CI/CD 接入方式确认（对应 D14）
