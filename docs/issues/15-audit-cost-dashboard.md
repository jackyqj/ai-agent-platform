# 15 审计与用量成本看板

Status: open
Type: task
Phase: Phase 2 — Agent 目录与治理（第 7–10 周）
Blocked by: 07, 08

## 背景

spec §1.3 成功标准「每一次 Agent 执行有完整审计轨迹，成本可核算到部门/个人」。基础能力现成：会话事件日志 + OTel 导出（FULL 模式 + 脱敏瀑布）+ `dsh-token-meter`/`dsh-session-stats` 统计；缺 collector/存储/查询与看板（research-report §7 差距 #6）。审计管道见 enterprise-shell §3.8（OTel→Collector→平台，外壳事件进 `audit_events` 表）。设施已定（D14/D16）：**有现成日志平台** → OTel collector 直接对接；**审计保留 180 天**。

## 目标

审计链路完整：会话/工具调用/审批全量入审计，成本看板可按部门/个人/Agent 核算。

## 交付物

- [ ] OTel collector 部署 + 公司日志平台接入
- [ ] 脱敏规则（redaction waterfall）：密钥/敏感字段结构性排除（telemetry 已保证凭据不进事件）
- [ ] 审计查询：按用户/部门/时间/工具/Agent 检索（含会话内容合规保留策略，见 Fog）
- [ ] 成本核算：token-meter/session-stats 数据上卷 → 部门/个人/Agent 成本（结合 03 网关用量日志）
- [ ] 成本看板：按日/周/月趋势、Top 用户/Agent、异常波动告警

## 验收标准

- [ ] 任一会话的完整执行链（请求→工具→结果→审批）可回溯
- [ ] 成本报表口径与财务一致，可导出
- [ ] 脱敏规则生效：审计数据中无密钥明文

## Comments

> 2025-08-18：**用量聚合 API + 看板 UI 完成**（src/stats/ + 管理 UI）。
> - `GET /api/admin/stats/usage`（PermissionGuard audit.view）：14 天任务趋势、状态分布、按 Agent 失败率、审批状态、今日配额用量、最近 5 条错误
> - 管理 UI 新增「用量看板」区（汇总卡 + 按 Agent 表 + 最近失败）
> - 实测：25 任务/8 失败、assistant=21(8失败)/report-builder=4(0失败)、配额今日 2/2、1/1
> - **注意**：当前聚合基于控制面 PG（tasks/approvals/quota）；token 级成本（token-meter 上卷）与 OTel 全链路（DSH→collector→公司平台）待网关（03）与日志平台对接后补充
> 遗留：OTel collector 部署与公司日志平台对接（D14）；token/成本口径；趋势图与告警。
