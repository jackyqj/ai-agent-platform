// RBAC 权限矩阵（13 工单）：权限点 → 允许角色；集中一处，守卫按点校验
// 角色：employee（普通员工）/ developer（研发，放开沙箱）/ admin（管理）

export type Permission =
  | 'agent.publish'      // 上架/下架/可见性
  | 'agent.approve'      // 批准/拒绝员工提审
  | 'agent.propose'      // 员工提审
  | 'agent.edit'         // 编排 spec 编辑（draft 读写 / 校验）
  | 'approval.decide'    // 审批决定
  | 'quota.manage'       // 配额策略管理
  | 'quota.view'         // 用量/策略查看
  | 'audit.view'         // 审计查询
  | 'task.view_all'      // 全量任务
  | 'task.cancel'        // 取消任务（admin 可取消他人）
  | 'instance.manage'    // 实例管理
  | 'user.manage'        // 用户管理
  | 'secrets.manage'     // D20 密钥读写（永不返回明文列表）
  | 'kb.manage'            // 知识库文档与索引管理
  | 'connector.manage'     // 连接器 / 工具目录
  | 'graph.edit'           // 组合图草稿
  | 'graph.publish'        // 组合图上架
  | 'skill.create'         // skill 草稿创建（登录即可）
  | 'skill.review'         // skill 版本审核
  | 'skill.manage'         // skill 管理：下架 / 代处理 / 改可见性

export const ROLE_ORDER = ['employee', 'developer', 'admin'] as const
export type Role = (typeof ROLE_ORDER)[number]

export const PERMISSIONS: Record<Permission, Role[]> = {
  // 员工基础
  'agent.propose': ['employee', 'developer', 'admin'],
  'task.cancel': ['employee', 'developer', 'admin'], // 自己的任务（归属校验仍生效）
  'skill.create': ['employee', 'developer', 'admin'], // skill 草稿创建
  // 开发者
  'agent.edit': ['developer', 'admin'], // 编排 spec 编辑
  'graph.edit': ['developer', 'admin'],
  'skill.review': ['developer', 'admin'],
  'audit.view': ['admin'], // v1 收紧到 admin；开发者审计权限按需放开
  // 管理员
  'agent.publish': ['admin'],
  'agent.approve': ['admin'],
  'approval.decide': ['admin'],
  'quota.manage': ['admin'],
  'quota.view': ['admin'],
  'task.view_all': ['admin'],
  'instance.manage': ['admin'],
  'user.manage': ['admin'],
  'secrets.manage': ['admin'],
  'kb.manage': ['admin'],
  'connector.manage': ['admin'],
  'graph.publish': ['admin'],
  'skill.manage': ['admin'],
}

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] ?? []).includes(role)
}

/** DSH `dsh-permission-presets` 表名（与 sandbox/mode 对齐，经 DSH_PERMISSION_MODE 注入） */
export type DshPresetName = 'read-only' | 'workspace-write' | 'danger-full-access'

export const DSH_PRESETS: DshPresetName[] = ['read-only', 'workspace-write', 'danger-full-access']

export const ROLE_DSH_PRESET: Record<Role, DshPresetName> = {
  employee: 'workspace-write',
  developer: 'danger-full-access',
  admin: 'danger-full-access',
}

export function isDshPresetName(value: string): value is DshPresetName {
  return value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access'
}

export function isRole(value: string): value is Role {
  return value === 'employee' || value === 'developer' || value === 'admin'
}

export function isPermission(value: string): value is Permission {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value)
}

/** `CP_DEPT_PERMISSION`：部门名:preset 逗号分隔，覆盖角色默认 */
export function parseDeptOverlays(raw: string | undefined): Record<string, DshPresetName> {
  const out: Record<string, DshPresetName> = {}
  for (const pair of (raw ?? '').split(',')) {
    const idx = pair.lastIndexOf(':')
    if (idx <= 0) continue
    const dept = pair.slice(0, idx).trim()
    const preset = pair.slice(idx + 1).trim()
    if (dept && isDshPresetName(preset)) out[dept] = preset
  }
  return out
}

/**
 * 部门覆盖优先，否则按角色默认。未知角色按员工收敛（workspace-write + ask）。
 * 存量会话不改：调用方只在新会话/新任务上 pin。
 */
export function resolveDshPreset(role: string, dept: string, overlays: Record<string, DshPresetName> = {}): DshPresetName {
  const overlay = overlays[dept]
  if (overlay) return overlay
  if (isRole(role)) return ROLE_DSH_PRESET[role]
  return 'workspace-write'
}
