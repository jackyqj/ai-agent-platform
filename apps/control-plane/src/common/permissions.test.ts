import assert from 'node:assert/strict'
import { test } from 'node:test'
import { can, parseDeptOverlays, resolveDshPreset, ROLE_DSH_PRESET } from './permissions.js'

test('employee cannot manage users or instances; admin can', () => {
  assert.equal(can('employee', 'user.manage'), false)
  assert.equal(can('employee', 'instance.manage'), false)
  assert.equal(can('employee', 'agent.propose'), true)
  assert.equal(can('employee', 'graph.publish'), false)
  assert.equal(can('admin', 'user.manage'), true)
  assert.equal(can('developer', 'audit.view'), false)
})

test('role maps to DSH permission preset', () => {
  assert.equal(ROLE_DSH_PRESET.employee, 'workspace-write')
  assert.equal(ROLE_DSH_PRESET.developer, 'danger-full-access')
  assert.equal(ROLE_DSH_PRESET.admin, 'danger-full-access')
})

test('resolveDshPreset uses role default then dept overlay', () => {
  assert.equal(resolveDshPreset('employee', '业务部'), 'workspace-write')
  assert.equal(resolveDshPreset('developer', '研发部'), 'danger-full-access')
  assert.equal(resolveDshPreset('unknown', ''), 'workspace-write')
  const overlays = { 业务部: 'read-only' as const, 研发部: 'workspace-write' as const }
  assert.equal(resolveDshPreset('admin', '业务部', overlays), 'read-only')
  assert.equal(resolveDshPreset('developer', '研发部', overlays), 'workspace-write')
  assert.equal(resolveDshPreset('developer', 'IT部', overlays), 'danger-full-access')
})

test('parseDeptOverlays skips invalid presets', () => {
  assert.deepEqual(parseDeptOverlays('HR/行政:workspace-write,坏:nope,研发部:danger-full-access'), {
    'HR/行政': 'workspace-write',
    研发部: 'danger-full-access',
  })
})
