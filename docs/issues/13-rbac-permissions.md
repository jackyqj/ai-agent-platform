# 13 权限分级与 RBAC

Status: open
Type: task
Phase: Phase 2 — Agent 目录与治理（第 7–10 周）
Blocked by: 07

## 背景

spec §5 Phase 2「权限分级：普通员工（workspace-write + ask）/ 开发者（danger-full-access）/ 自定义」。DSH 原生权限是 `sandbox/mode × approval/policy` 二旋钮 preset（research-report §3），无角色/RBAC——角色模型需在控制面建立，再映射到 DSH 的 preset 旋钮。角色定义与安全要点见 enterprise-shell §3.1/§6。

## 目标

控制面角色模型上线：角色 → 权限策略（DSH 旋钮 + 平台操作权限）的完整映射。

## 交付物

- [ ] 角色模型：普通员工 / 开发者 / 管理员 / 自定义（数据表 + API；默认映射按部门标签驱动：IT/研发=developer、指定部门=admin、其余=employee，本地覆盖例外，D12）
- [ ] 角色 → DSH 权限 preset 映射（`dsh-permission-presets` 对接）
- [ ] 平台操作权限：管理后台功能按角色收敛
- [ ] 部门级策略覆盖（默认继承 + 部门覆盖）
- [ ] 权限变更审计与生效机制（新会话生效，存量会话策略钉死——DSH 原语）

## 验收标准

- [ ] 普通员工无法越权执行危险工具/管理操作，尝试即被拦截并留痕
- [ ] 开发者角色可独立调试（danger-full-access），其行为同样全量审计
- [ ] 角色变更后新会话立即生效

## Comments

> 2025-08-18：**权限矩阵集中化完成**（src/common/permissions.ts + permission.guard.ts）。
> - 权限点枚举（11 个：agent.publish/approve/propose、approval.decide、quota.manage/view、audit.view、task.view_all/cancel、instance.manage、user.manage）+ 角色映射表
> - PermissionGuard 按点校验（替代散落 @Roles）；配额管理端点已应用
> - 实测：employee 访问 /api/admin/quota、/api/admin/audit → 403；admin → 200
> 遗留：权限点全量应用到既有管理端点（当前 admin 端点多为 @Roles 等效）；部门级策略覆盖（等 07 组织同步）；开发者审计查看权限按需放开。
