import { SetMetadata } from '@nestjs/common'
import type { Permission } from './permissions.js'

export const PERMISSION_KEY = 'permission'

/** 在 handler 或 controller 上声明所需权限点；由 PermissionGuard 读取 */
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission)
