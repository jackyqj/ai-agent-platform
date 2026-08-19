import { SetMetadata } from '@nestjs/common'

export const ROLES_KEY = 'roles'
/** 角色守卫元数据：@Roles('admin') / @Roles('admin','developer') */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)
