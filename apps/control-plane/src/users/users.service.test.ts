import assert from 'node:assert/strict'
import { test } from 'node:test'
import { UsersService } from './users.service.js'
import { RolesService } from '../common/roles.service.js'
import { PgStore } from '../store/pg.store.js'

test('patch disables a seeded user', async () => {
  const users = new UsersService()
  const u = await users.patch('u-hr-1', { status: 'disabled' })
  assert.equal(u?.status, 'disabled')
  assert.equal(users.get('u-hr-1')?.status, 'disabled')
})

test('patch updates role override and department', async () => {
  const users = new UsersService()
  const u = await users.patch('u-hr-1', { role: 'developer', dept: '研发部' })
  assert.equal(u?.role, 'developer')
  assert.equal(u?.dept, '研发部')
})

test('patch returns undefined for unknown user', async () => {
  const users = new UsersService()
  assert.equal(await users.patch('no-such', { status: 'disabled' }), undefined)
})

test('re-enable restores active status', async () => {
  const users = new UsersService()
  await users.patch('u-hr-1', { status: 'disabled' })
  const u = await users.patch('u-hr-1', { status: 'active' })
  assert.equal(u?.status, 'active')
})

class MemPg {
  pool = {}
  rows = new Map<string, {
    id: string
    externalId: string
    name: string
    dept: string
    role: string
    status: string
    roleOverride: string | null
  }>()
  async listUsers() {
    return [...this.rows.values()]
  }
  async upsertUser(row: {
    id: string
    externalId: string
    name: string
    dept: string
    role: string
    status: string
    roleOverride: string | null
  }) {
    this.rows.set(row.id, { ...row })
  }
}

test('disable and role override survive a new UsersService against the same store', async () => {
  const pg = new MemPg()
  const a = new UsersService(pg as never)
  await a.onModuleInit()
  await a.patch('u-hr-1', { status: 'disabled', role: 'developer' })
  const b = new UsersService(pg as never)
  await b.onModuleInit()
  const u = b.get('u-hr-1')
  assert.equal(u?.status, 'disabled')
  assert.equal(u?.role, 'developer')
})

test('SSO upsert survives restart and keeps an admin role override', async () => {
  const pg = new MemPg()
  const a = new UsersService(pg as never)
  await a.onModuleInit()
  const created = await a.upsert({ externalId: 'ding-99', name: '新人', dept: '业务部' })
  await a.patch(created.id, { role: 'admin' })
  const b = new UsersService(pg as never)
  await b.onModuleInit()
  const u = b.findByExternal('ding-99')
  assert.equal(u?.name, '新人')
  assert.equal(u?.role, 'admin')
  assert.equal(u?.dept, '业务部')
})

test('patch assigns a custom role name (13 自定义角色)', async () => {
  // 定义一个自定义角色，注入 UsersService 校验
  const roleStore = new Map<string, { permissions: string[]; dshPreset: string }>()
  const rolePg = {
    pool: {},
    listRoleDefinitions: async () => [...roleStore.entries()].map(([name, v]) => ({ name, permissions: v.permissions, dshPreset: v.dshPreset })),
    upsertRoleDefinition: async (r: { name: string; permissions: string[]; dshPreset: string }) => roleStore.set(r.name, { permissions: r.permissions, dshPreset: r.dshPreset }),
    deleteRoleDefinition: async (name: string) => roleStore.delete(name),
  } as never
  const roles = new RolesService(rolePg)
  await roles.upsert('report-viewer', ['task.view_all'], 'read-only')
  const users = new UsersService(new PgStore(undefined), roles)
  const u = await users.patch('u-hr-1', { role: 'report-viewer' })
  assert.equal(u?.role, 'report-viewer')
})

test('patch rejects an unknown custom role name', async () => {
  const users = new UsersService()
  await assert.rejects(users.patch('u-hr-1', { role: 'no-such-role' }), /未知角色/)
})

test('adopt falls back to dept role for a dangling custom role name', async () => {
  const pg = new MemPg()
  pg.rows.set('u-x', { id: 'u-x', externalId: 'x', name: '悬空', dept: '业务部', role: 'deleted-role', status: 'active', roleOverride: null })
  const users = new UsersService(pg as never)
  await users.onModuleInit()
  const u = users.get('u-x')
  assert.equal(u?.role, 'employee', '悬空自定义角色回退到部门角色(业务部→employee)')
})
