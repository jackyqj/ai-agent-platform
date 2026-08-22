import { Injectable, OnModuleInit } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { loadConfig } from '../config/config.js'
import type { AuthUser } from '../common/auth.guard.js'
import { isRole, type Role } from '../common/permissions.js'
import { RolesService } from '../common/roles.service.js'
import { PgStore, type UserRow } from '../store/pg.store.js'

export interface User {
  id: string
  externalId: string // 钉钉用户 id（oidc 模式）/ 任意 id（dev 模式）
  name: string
  dept: string
  role: string // 预置 Role 或自定义角色名（13 工单）
  status: 'active' | 'disabled'
}

/**
 * 用户/组织服务（07 工单 + D12）：
 * - oidc 模式：钉钉组织架构同步 → users 表（外部 id 为主键关联）
 * - dev 模式：内存种子，便于本地开发/冒烟；PG 可用时 hydrate，补丁跨重启保留
 * - 角色映射：部门标签驱动（IT/研发=developer、指定部门=admin、其余=employee）+ 本地覆盖表 + 自定义角色（13）
 */
@Injectable()
export class UsersService implements OnModuleInit {
  private cfg = loadConfig()
  private users = new Map<string, User>() // id → user
  private byExternal = new Map<string, string>() // externalId → id
  private overrides = new Map<string, string>() // userId → role（本地覆盖，D12 例外；含自定义角色名）

  constructor(
    private readonly pg: PgStore = new PgStore(undefined),
    private readonly roles: RolesService = new RolesService(pg),
  ) {
    // dev 种子：模拟钉钉同步结果（3 个部门 × 角色）
    this.seed('u-hr-1', 'hr-1001', '王小明', 'HR/行政', 'employee')
    this.seed('u-hr-2', 'hr-1002', '李小红', 'HR/行政', 'employee')
    this.seed('u-biz-1', 'biz-2001', '张业务', '业务部', 'employee')
    this.seed('u-dev-1', 'dev-3001', '赵开发', '研发部', 'developer')
    this.seed('u-dev-2', 'dev-3002', '钱测试', '研发部', 'developer')
    this.seed('u-admin', 'admin-0001', '管理员', 'IT部', 'admin')
  }

  async onModuleInit(): Promise<void> {
    await this.hydrate()
  }

  private canPersist(): boolean {
    return this.pg.pool != null
  }

  private async hydrate(): Promise<void> {
    if (!this.canPersist()) return
    try {
      const rows = await this.pg.listUsers()
      for (const r of rows) this.adopt(r)
      for (const u of this.users.values()) {
        if (!rows.some((r) => r.id === u.id)) await this.save(u)
      }
    } catch (e) {
      console.error('[users] PG hydrate failed, using memory seeds:', (e as Error).message)
    }
  }

  private adopt(r: UserRow): void {
    const override = r.roleOverride && (isRole(r.roleOverride) || this.roles.has(r.roleOverride)) ? r.roleOverride : undefined
    // role 列仅保留「有效」值：预置 Role 或已定义的自定义角色名；空值/悬空（已删除的角色）回退到部门推断
    const role = override ?? ((r.role && (isRole(r.role) || this.roles.has(r.role))) ? r.role : this.roleForDept(r.dept))
    const user: User = {
      id: r.id,
      externalId: r.externalId,
      name: r.name,
      dept: r.dept,
      role,
      status: r.status === 'disabled' ? 'disabled' : 'active',
    }
    this.users.set(user.id, user)
    this.byExternal.set(user.externalId, user.id)
    if (override) this.overrides.set(user.id, override)
  }

  private async save(u: User): Promise<void> {
    if (!this.canPersist()) return
    try {
      await this.pg.upsertUser({
        id: u.id,
        externalId: u.externalId,
        name: u.name,
        dept: u.dept,
        role: u.role,
        status: u.status,
        roleOverride: this.overrides.get(u.id) ?? null,
      })
    } catch (e) {
      console.error('[users] PG upsert failed:', (e as Error).message)
    }
  }

  private seed(id: string, externalId: string, name: string, dept: string, explicitRole?: User['role']) {
    const role = explicitRole ?? this.roleForDept(dept)
    const user: User = { id, externalId, name, dept, role, status: 'active' }
    this.users.set(id, user)
    this.byExternal.set(externalId, id)
  }

  /** 部门标签 → 角色（D12）：ROLE_MAP_BY_DEPT 命中 → 对应角色；未命中 → employee */
  private roleForDept(dept: string): Role {
    const hit = this.cfg.roleMapByDept[dept]
    if (hit === 'developer' || hit === 'admin') return hit
    // 兜底约定：含「研发/IT/技术」关键词的部门给 developer
    if (/研发|IT|技术|数据/.test(dept)) return 'developer'
    return 'employee'
  }

  findByExternal(externalId: string): User | undefined {
    const id = this.byExternal.get(externalId)
    return id ? this.users.get(id) : undefined
  }

  /** 钉钉同步 upsert（oidc 模式回调/定时同步调用） */
  async upsert(input: { externalId: string; name: string; dept: string }): Promise<User> {
    const existing = this.findByExternal(input.externalId)
    if (existing) {
      const next: User = {
        ...existing,
        name: input.name,
        dept: input.dept,
        role: this.overrides.get(existing.id) ?? this.roleForDept(input.dept),
      }
      this.users.set(existing.id, next)
      await this.save(next)
      return next
    }
    const user: User = {
      id: randomUUID(),
      externalId: input.externalId,
      name: input.name,
      dept: input.dept,
      role: this.roleForDept(input.dept),
      status: 'active',
    }
    this.users.set(user.id, user)
    this.byExternal.set(input.externalId, user.id)
    await this.save(user)
    return user
  }

  get(id: string): User | undefined {
    return this.users.get(id)
  }

  list(): User[] {
    return [...this.users.values()]
  }

  setRoleOverride(userId: string, role: string) {
    this.overrides.set(userId, role)
    const u = this.users.get(userId)
    if (u) u.role = role
  }

  /** 管理后台：启用/禁用、部门、角色覆盖（10 工单 + 13 自定义角色） */
  async patch(userId: string, input: { status?: User['status']; role?: string; dept?: string }): Promise<User | undefined> {
    const u = this.users.get(userId)
    if (!u) return undefined
    if (input.dept !== undefined) u.dept = input.dept
    if (input.role !== undefined) {
      const role = input.role.trim()
      if (isRole(role) || this.roles.has(role)) {
        this.setRoleOverride(userId, role)
      } else {
        throw new Error(`未知角色：${role}`)
      }
    }
    if (input.status !== undefined) {
      switch (input.status) {
        case 'active':
        case 'disabled':
          u.status = input.status
          break
        default: {
          const _exhaustive: never = input.status
          throw new Error(`unknown status: ${_exhaustive}`)
        }
      }
    }
    await this.save(u)
    return u
  }

  toAuthUser(u: User): AuthUser {
    return { sub: u.id, role: u.role, dept: u.dept }
  }
}
