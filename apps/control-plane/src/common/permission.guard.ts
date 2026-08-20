// 权限点守卫（13 工单）：按 RBAC 矩阵校验；拒绝时写 audit.authz.denied
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuditStore } from './audit.store.js'
import { PERMISSION_KEY } from './require-permission.decorator.js'
import { can, type Permission, type Role } from './permissions.js'

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditStore,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (!permission) return true

    const req = ctx.switchToHttp().getRequest<{ user?: { sub?: string; role: string } }>()
    const role = req.user?.role as Role | undefined
    if (!role) throw new ForbiddenException('auth required before permission check')
    if (!can(role, permission)) {
      await this.audit.append({
        userId: req.user?.sub,
        eventType: 'authz.denied',
        payload: { permission, role },
      })
      throw new ForbiddenException(`role ${role} lacks permission ${permission}`)
    }
    return true
  }
}
