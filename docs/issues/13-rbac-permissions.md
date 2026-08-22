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

- [x] 角色模型：普通员工 / 开发者 / 管理员 / 自定义（数据表 + API；默认映射按部门标签驱动：IT/研发=developer、指定部门=admin、其余=employee，本地覆盖例外，D12）
- [x] 角色 → DSH 权限 preset 映射（`dsh-permission-presets` 对接）
- [x] 平台操作权限：管理后台功能按角色收敛
- [x] 部门级策略覆盖（默认继承 + 部门覆盖）
- [x] 权限变更审计与生效机制（新会话生效，存量会话策略钉死——DSH 原语）

## 验收标准

- [x] 普通员工无法越权执行危险工具/管理操作，尝试即被拦截并留痕
- [x] 开发者角色可独立调试（danger-full-access），其行为同样全量审计
- [x] 角色变更后新会话立即生效

## Comments

> 2025-08-18：**权限矩阵集中化完成**（src/common/permissions.ts + permission.guard.ts）。
> - 权限点枚举（11 个：agent.publish/approve/propose、approval.decide、quota.manage/view、audit.view、task.view_all/cancel、instance.manage、user.manage）+ 角色映射表
> - PermissionGuard 按点校验（替代散落 @Roles）；配额管理端点已应用
> - 实测：employee 访问 /api/admin/quota、/api/admin/audit → 403；admin → 200
> 遗留：权限点全量应用到既有管理端点（当前 admin 端点多为 @Roles 等效）；部门级策略覆盖（等 07 组织同步）；开发者审计查看权限按需放开。
>
> 2026-08-21：**权限点全量落地 + DSH preset 对接**。`@RequirePermission` + 可注入 PermissionGuard（拒绝写 `authz.denied`）；JWT 每次请求刷新 live 角色。角色默认 `employee=workspace-write`、`developer/admin=danger-full-access`，经 `DSH_PERMISSION_MODE` 注入 Web 实例与 worker（base bundle / worker.cordis 已读该 env）。部门覆盖：`CP_DEPT_PERMISSION` + `PUT /api/admin/permissions/overlays`（内存，优先于角色）。改角色/部门会回收旧实例，新会话 pin 新 preset。自定义角色与 users 落 PG 仍未做。
>
> 2026-08-21（二）：**users 落 PG**。迁移 `007_users.sql`（id 改为 text、dept 名、role_override）。hydrate 时 PG 覆盖种子，缺行再回写；patch/upsert 双写。禁用与角色覆盖跨重启保留。自定义角色仍未做。

> 2026-08-22：**自定义角色落地**（13 收尾）。
> - 迁移 011：role_definitions（name 主键 + permissions jsonb + dsh_preset）
> - RolesService（@Global，写入后刷新内存缓存）：`can(role, perm)` 预置角色走内置矩阵、自定义角色查权限点集合；`dshPresetOf` 取自定义 preset；upsert/remove 校验（预置角色不可编辑/删除、未知权限点/非法 preset 拒绝）
> - PermissionGuard / PermissionPolicyService 接入 RolesService；UsersService `role` 放宽为 string，`patch` 支持指派自定义角色、拒绝未知角色名
> - API：GET/POST/DELETE `/api/admin/roles`（user.manage）+ 审计 admin.role.upsert/remove；管理后台「角色」区（权限点勾选 + DSH preset）+ 用户角色下拉并入自定义角色
> - 单测：RolesService 5 个（can/presetOf/upsert/remove）、permission.guard 自定义角色放行、users custom-role patch；控制面 90/90、web 18/18；真实 PG 冒烟通过
> - 一致性修正：① 内联 `can()` 端点（tasks.cancel 的 task.view_all、agents.getSpec 的 agent.edit）改走 RolesService.can，自定义角色不再恒拒；② PermissionPolicyService.resolve 改为「部门 overlay 恒最高 → 自定义 preset → 内置默认」（修正自定义角色被短路绕过部门覆盖）；③ UsersService.adopt 对悬空（已删除）自定义角色名回退到部门推断
> - 单测增至：permission-policy overlay 优先 + adopt 悬空回退；控制面 92/92、web 18/18
> 遗留：组织架构定时同步（07）。
