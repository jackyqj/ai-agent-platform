# 16 配额与限流

Status: open
Type: task
Phase: Phase 2 — Agent 目录与治理（第 7–10 周）
Blocked by: 03, 06

## 背景

spec §2.2 关键发现：DSH **全仓无限流/配额包**，`dsh-token-meter`/`dsh-session-stats` 仅统计不执行。配额与限流必须做在模型网关/控制面（research-report §7 差距 #4）。配额服务设计见 enterprise-shell §3.6：`quota_policies`/`quota_usage` 表、**网关（LiteLLM）硬执行 + 计量回调聚合**、超限 reject/warn 可配置。

## 目标

按部门/个人/Agent 的模型预算与并发限流：超预算降级或拒绝，不阻塞其他用户。

## 交付物

- [ ] 配额模型：预算档位（日/月 token 或金额）× 归属（部门/个人/Agent）
- [ ] 网关层限流：每用户/每 Agent 并发、每模型速率
- [ ] 超配额行为：告警 → 降级（换模型）→ 拒绝（可配置）
- [ ] 配额实时查询与调整 API（管理后台入口）
- [ ] 配额消费数据与成本看板打通（15）

## 验收标准

- [ ] 单用户打满配额不影响他人（隔离性验证）
- [ ] 超限行为按配置生效且用户收到明确提示
- [ ] 配额调整 1 分钟内生效

## Comments

> 2025-08-18：**配额核心完成并实测**（src/quota/）。
> - 迁移 004：quota_policies + quota_usage（scope user/dept/all、period day/month、budget_requests、over_policy reject/warn；token/成本预算列预留网关 03）
> - QuotaService：最具体者优先解析 + 提交前检查 + 用量记账（used_requests）；TasksService.submit 前置配额门
> - API：GET/POST /api/admin/quota/policies（PermissionGuard quota.manage）
> - 实测：用户级 2/天 覆盖全员 20/天；第 3 次触发 → HTTP 429「配额已用尽：1/1（day）」；用量落库
> - 管理 UI 已加配额面板（策略列表 + 设置）
> 遗留：网关（03）token/成本记账对接；warn 策略的告警通道（当前日志）；部门级策略（等 07 组织同步）。
