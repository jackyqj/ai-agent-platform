import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PermissionPolicyService } from './permission-policy.service.js'
import { RolesService } from './roles.service.js'

// 解析顺序：部门覆盖恒最高 → 自定义角色 preset → 内置角色默认。
test('resolve：部门覆盖优先于自定义角色 preset', async () => {
  const rolePg = {
    pool: {},
    listRoleDefinitions: async () => [{ name: 'report-viewer', permissions: ['task.view_all'], dshPreset: 'read-only' }],
  } as never
  const roles = new RolesService(rolePg)
  await roles.onModuleInit()
  const svc = new PermissionPolicyService(roles)
  svc.setOverlay('研发部', 'danger-full-access')
  // 部门 overlay 命中 → 覆盖自定义角色 preset
  assert.equal(svc.resolve('report-viewer', '研发部'), 'danger-full-access')
  // 无部门 overlay → 自定义角色 preset
  assert.equal(svc.resolve('report-viewer', '业务部'), 'read-only')
  // 内置角色无 overlay → 角色默认
  assert.equal(svc.resolve('employee', '业务部'), 'workspace-write')
  assert.equal(svc.resolve('admin', '业务部'), 'danger-full-access')
})
