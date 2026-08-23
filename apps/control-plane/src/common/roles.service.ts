// 自定义角色（13 工单收尾）：在预置 employee/developer/admin 之外支持角色名 + 权限点集合 + DSH preset。
// 预置角色的权限集仍由 permissions.ts 的 PERMISSIONS 矩阵决定；本服务只承载「自定义」角色，
// 并在写入后刷新内存缓存（单进程控制面，写时刷新即可，无需跨实例失效）。
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PgStore } from '../store/pg.store.js'
import {
  can as builtinCan, isDshPresetName, isPermission, isRole, PERMISSIONS, ROLE_DSH_PRESET,
  type DshPresetName, type Permission,
} from './permissions.js'

export interface RoleDefinition {
  name: string
  permissions: Permission[]
  dshPreset: DshPresetName
}

@Injectable()
export class RolesService implements OnModuleInit {
  private logger = new Logger('Roles')
  private cache = new Map<string, RoleDefinition>()

  constructor(private readonly pg: PgStore) {}

  async onModuleInit() {
    await this.reload()
  }

  private async reload(): Promise<void> {
    if (!this.pg.pool) return
    try {
      const rows = await this.pg.listRoleDefinitions()
      this.cache.clear()
      for (const r of rows) {
        this.cache.set(String(r.name), {
          name: String(r.name),
          permissions: (r.permissions as string[]).filter(isPermission),
          dshPreset: isDshPresetName(String(r.dshPreset)) ? (String(r.dshPreset) as DshPresetName) : 'workspace-write',
        })
      }
    } catch (e) {
      this.logger.error(`roles reload failed: ${(e as Error).message}`)
    }
  }

  has(role: string): boolean {
    return this.cache.has(role)
  }

  /** 权限判定：预置角色走内置矩阵；自定义角色看其权限点集合；未知角色拒绝。 */
  can(role: string, permission: Permission): boolean {
    if (isRole(role)) return builtinCan(role, permission)
    return this.cache.get(role)?.permissions.includes(permission) ?? false
  }

  /** 角色拥有的全部权限点（预置角色展开矩阵；自定义角色取存储集合） */
  permissionsOf(role: string): Permission[] {
    if (isRole(role)) {
      return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => builtinCan(role, p))
    }
    return this.cache.get(role)?.permissions ?? []
  }

  dshPresetOf(role: string): DshPresetName {
    if (isRole(role)) return ROLE_DSH_PRESET[role]
    return this.cache.get(role)?.dshPreset ?? 'workspace-write'
  }

  list(): RoleDefinition[] {
    return [...this.cache.values()]
  }

  async upsert(name: string, permissions: Permission[], dshPreset: DshPresetName): Promise<RoleDefinition> {
    const roleName = name.trim()
    if (isRole(roleName)) throw new Error(`预置角色不可编辑：${roleName}`)
    if (!roleName) throw new Error('角色名必填')
    for (const p of permissions) {
      if (!isPermission(p)) throw new Error(`未知权限点：${p}`)
    }
    if (!isDshPresetName(dshPreset)) throw new Error(`dsh_preset 必须为 read-only | workspace-write | danger-full-access`)
    await this.pg.upsertRoleDefinition({ name: roleName, permissions, dshPreset })
    await this.reload()
    return this.cache.get(roleName)!
  }

  async remove(name: string): Promise<boolean> {
    if (isRole(name)) throw new Error(`预置角色不可删除：${name}`)
    const ok = await this.pg.deleteRoleDefinition(name)
    if (ok) await this.reload()
    return ok
  }
}
