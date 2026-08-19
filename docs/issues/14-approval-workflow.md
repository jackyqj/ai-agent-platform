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
