import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RolesService } from './roles.service.js'
import type { PgStore } from '../store/pg.store.js'

// 用内存 mock PgStore：pool 非空触发 reload；store 为后端的替身，写入即回读。
function makeSvc() {
  const store = new Map<string, { permissions: string[]; dshPreset: string }>()
  const pg = {
    pool: {},
    listRoleDefinitions: async () =>
      [...store.entries()].map(([name, v]) => ({ name, permissions: v.permissions, dshPreset: v.dshPreset })),
    upsertRoleDefinition: async (r: { name: string; permissions: string[]; dshPreset: string }) => store.set(r.name, { permissions: r.permissions, dshPreset: r.dshPreset }),
    deleteRoleDefinition: async (name: string) => store.delete(name),
  } as unknown as PgStore
  const svc = new RolesService(pg)
  return { svc, store }
}

test('can：预置角色走内置矩阵（employee 可 propose，不能 user.manage）', async () => {
  const { svc } = makeSvc()
  await svc.onModuleInit()
  assert.equal(svc.can('employee', 'agent.propose'), true)
  assert.equal(svc.can('employee', 'user.manage'), false)
  assert.equal(svc.can('admin', 'user.manage'), true)
})

test('can：自定义角色按权限点集合判定', async () => {
  const { svc, store } = makeSvc()
  store.set('report-viewer', { permissions: ['task.view_all', 'quota.view'], dshPreset: 'read-only' })
  await svc.onModuleInit()
  assert.equal(svc.has('report-viewer'), true)
  assert.equal(svc.can('report-viewer', 'task.view_all'), true)
  assert.equal(svc.can('report-viewer', 'quota.view'), true)
  assert.equal(svc.can('report-viewer', 'user.manage'), false, '未授予的权限应拒绝')
  assert.equal(svc.can('nope-role', 'task.view_all'), false, '未知角色拒绝')
})

test('dshPresetOf：预置角色用默认映射；自定义角色用自身 preset', async () => {
  const { svc, store } = makeSvc()
  assert.equal(svc.dshPresetOf('admin'), 'danger-full-access')
  store.set('hr-operator', { permissions: [], dshPreset: 'workspace-write' })
  await svc.onModuleInit()
  assert.equal(svc.dshPresetOf('hr-operator'), 'workspace-write')
})

test('upsert：写入后刷新缓存；拒绝预置角色/未知权限/非法 preset', async () => {
  const { svc } = makeSvc()
  await svc.onModuleInit()
  const def = await svc.upsert('report-viewer', ['task.view_all'], 'read-only')
  assert.equal(def.permissions.length, 1)
  assert.equal(svc.can('report-viewer', 'task.view_all'), true)
  await assert.rejects(svc.upsert('admin', [], 'read-only'), /预置角色不可编辑/)
  await assert.rejects(svc.upsert('x', ['nope'], 'read-only'), /未知权限点/)
  await assert.rejects(svc.upsert('x', ['task.view_all'], 'bad-preset'), /dsh_preset 必须/)
})

test('remove：删除并刷新；预置角色不可删', async () => {
  const { svc } = makeSvc()
  await svc.onModuleInit()
  await svc.upsert('report-viewer', ['task.view_all'], 'read-only')
  assert.equal(svc.has('report-viewer'), true)
  assert.equal(await svc.remove('report-viewer'), true)
  assert.equal(svc.has('report-viewer'), false)
  await assert.rejects(svc.remove('admin'), /预置角色不可删除/)
})
