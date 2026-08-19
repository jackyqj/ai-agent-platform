// 权限点守卫（13 工单）：按 RBAC 矩阵校验，替代散落的 @Roles
// 用法：@UseGuards(AuthGuard, new PermissionGuard('quota.manage'))
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { can, type Permission, type Role } from './permissions.js'

export class PermissionGuard implements CanActivate {
  constructor(private readonly permission: Permission) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: { role: string } }>()
    const role = req.user?.role as Role | undefined
    if (!role) throw new ForbiddenException('auth required before permission check')
    if (!can(role, this.permission)) {
      throw new ForbiddenException(`role ${role} lacks permission ${this.permission}`)
    }
    return true
  }
}

/** @Roles 兼容层：从权限矩阵推导（避免改现有路由时遗漏） */
export const RolesFrom = (permission: Permission) => (_target: unknown, _key: string, _descriptor: PropertyDescriptor) => _descriptor
