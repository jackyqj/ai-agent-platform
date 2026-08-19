// RBAC 权限矩阵（13 工单）：权限点 → 允许角色；集中一处，守卫按点校验
// 角色：employee（普通员工）/ developer（研发，放开沙箱）/ admin（管理）

export type Permission =
  | 'agent.publish'      // 上架/下架/可见性
  | 'agent.approve'      // 批准/拒绝员工提审
  | 'agent.propose'      // 员工提审
  | 'approval.decide'    // 审批决定
  | 'quota.manage'       // 配额策略管理
  | 'quota.view'         // 用量/策略查看
  | 'audit.view'         // 审计查询
  | 'task.view_all'      // 全量任务
  | 'task.cancel'        // 取消任务（admin 可取消他人）
  | 'instance.manage'    // 实例管理
  | 'user.manage'        // 用户管理

export const ROLE_ORDER = ['employee', 'developer', 'admin'] as const
export type Role = (typeof ROLE_ORDER)[number]

export const PERMISSIONS: Record<Permission, Role[]> = {
  // 员工基础
  'agent.propose': ['employee', 'developer', 'admin'],
  'task.cancel': ['employee', 'developer', 'admin'], // 自己的任务（归属校验仍生效）
  // 开发者
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
}

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] ?? []).includes(role)
}
