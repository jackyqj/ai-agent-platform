import assert from 'node:assert/strict'
import { test } from 'node:test'
import { UsersService } from './users.service.js'

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
