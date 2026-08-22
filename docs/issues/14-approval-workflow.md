# 14 审批流（授权存储 + 多级审批）

Status: open
Type: task
Phase: Phase 2 — Agent 目录与治理（第 7–10 周）
Blocked by: 07, 13

## 背景

spec §2.2 关键发现：DSH 原生审批（`dsh-user-approval`）是**一次性**的（allowed-once），无 allow-always、无授权存储——每次敏感操作都要再问。平台层必须自建授权存储与多级审批，作为企业治理的兜底。审批服务设计见 enterprise-shell §3.7（`approval_requests` 表 + 受控「记住 X 小时」授权）。

## 目标

敏感操作（数据库写、对外发送、危险工具）的审批流：员工本人确认 + 可选主管/管理员审批；高频低危操作有受控的「记住授权」。

## 交付物

- [ ] 授权存储：审批决定持久化（谁/什么操作/何时/有效期）
- [ ] 审批策略配置：按 Agent/工具/部门定义「需审批」清单
- [ ] 一级审批（本人确认，对应 DSH approval seam）与多级审批（主管/管理员）
- [ ] 敏感工具强制审批清单（数据库写、对外发送、生产系统操作等）
- [ ] 审批超时/拒绝/取消的完整状态机
- [ ] 审批审计：每次决定入审计（配合 15）

## 验收标准

- [ ] 敏感工具调用无有效授权即被拦截（fail-closed）
- [ ] 授权记录可查、可撤销，撤销后立即生效
- [ ] M2 里程碑：越权工具调用被拦截并留痕

## Comments

> 2025-08-18：**审批流核心完成并实测**（`src/approvals/`）。
> - 授权存储：`approval_requests` 表（PG，003 迁移）+「记住 X 小时」（CP_GRANT_HOURS，self 级命中免审批）
> - 任务前置审批门：preset approvalLevel 决定——none 直通；self 无近期授权 → pending；manager → 必须审批
> - API：`/api/approvals/mine`、`/api/admin/approvals/pending`、`/api/admin/approvals/:id/decide`
> - 实测：触发 report-builder → pending（未入队）→ 批准 → 入队执行；同 key 同 action 二次触发 → 授权命中直接入队；不同 key → 各自审批（per-requester 语义）
> 遗留：多级审批（manager 级流转到主管）、与 DSH 原生 approval seam 的深层挂钩、审批超时/撤销。

> 2026-08-22：**多级审批落地**（14 收尾，与 13 自定义角色协同）。
> - 迁移 012：agent_presets.approval_chain（编排外管理配置）+ approval_requests.chain/current_level
> - 审批链：manager 级按「有序角色链」逐级批（默认 ['admin']；可从 agent_presets.approval_chain 配置为多级）；decide 校验当前层级角色（等于该角色或 admin），全链通过才入队，审计 approval.advanced/approved/rejected
> - 配置：`PUT /api/admin/agents/:id/approval-chain`（agent.publish）+ 审计 admin.agent.approval_chain；**链角色须具 approval.decide 能力**（admin 或自定义角色授予该权限），否则配置端拒绝（防死链）；管理后台 Agent 行内「审批链」输入、待审批面板显示「层级 n/总数 → 当前需角色」
> - 单测：ApprovalService 7/7（默认链/自定义链/单级入队/多级推进/角色不符/拒绝/self 授权命中）；控制面 99/99、web 18/18；真实 PG 冒烟通过
> 遗留：与 DSH 原生 approval seam 的深层挂钩；审批超时/撤销；敏感工具/部门级「需审批」清单；一级审批改为「本人确认」。（注：非 admin 的链角色需先经 13 自定义角色授予 approval.decide。）

> 2026-08-22（二）：**审批超时/撤销**（14 状态机补全）。
> - 超时：ApprovalService 加定时清理（CP_APPROVAL_TTL_HOURS 默认 24h / CP_APPROVAL_SWEEP_MS 默认 60s），超时 pending → cancelled + 审计 approval.expired（fail-soft）
> - 撤销：`POST /api/approvals/:id/cancel`（请求人撤销自己的 pending；非请求人/已终态拒绝）+ 审计 approval.cancelled
> - 单测：sweepExpired / cancel（含非请求人、已终态不可撤销）；控制面 102/102、web 18/18；真实 PG 冒烟通过
> - 复查修订：超时基准取「最近无进展」（COALESCE(decided_at, created_at)），多级长链有推进即不误杀；两个持久化分支统一（memory 也写 decidedAt）；approval.expired/cancelled 审计载荷在 PG/内存路径一致（均含 agentPresetId）；Web 区标题改为「我发起的审批」（数据方向是「我发起、待他人审批」）
> 遗留：与 DSH 原生 approval seam 的深层挂钩；敏感工具/部门级「需审批」清单；一级审批改为「本人确认」；已批准授权的即时撤销。
