import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import { AuditStore } from './audit.store.js'
import { PermissionGuard } from './permission.guard.js'
import { RolesService } from './roles.service.js'
import { PgStore } from '../store/pg.store.js'
import { PERMISSION_KEY } from './require-permission.decorator.js'

function makeRoles() {
  return new RolesService({ pool: {}, listRoleDefinitions: async () => [] } as never)
}

function fakeCtx(user: { sub: string; role: string } | undefined) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  }
}

test('PermissionGuard allows admin user.manage and audits employee deny', async () => {
  const audit = new AuditStore(new PgStore(undefined))
  const reflector = {
    getAllAndOverride: () => 'user.manage',
  }
  const guard = new PermissionGuard(reflector as never, audit, makeRoles())

  assert.equal(await guard.canActivate(fakeCtx({ sub: 'u-admin', role: 'admin' }) as never), true)

  await assert.rejects(
    () => guard.canActivate(fakeCtx({ sub: 'u-hr-1', role: 'employee' }) as never),
    (e: unknown) => e instanceof ForbiddenException,
  )
  const events = await audit.query({ eventType: 'authz.denied', limit: 10 })
  assert.equal(events.length, 1)
  assert.equal(events[0]?.userId, 'u-hr-1')
  assert.deepEqual(events[0]?.payload, { permission: 'user.manage', role: 'employee' })
})

test('PermissionGuard skips when no permission metadata', async () => {
  const audit = new AuditStore(new PgStore(undefined))
  const reflector = { getAllAndOverride: () => undefined }
  const guard = new PermissionGuard(reflector as never, audit, makeRoles())
  assert.equal(await guard.canActivate(fakeCtx({ sub: 'u-hr-1', role: 'employee' }) as never), true)
  assert.equal(PERMISSION_KEY, 'permission')
})

test('PermissionGuard allows a custom role with the granted permission', async () => {
  const audit = new AuditStore(new PgStore(undefined))
  const roleStore = new Map<string, { permissions: string[]; dshPreset: string }>()
  roleStore.set('auditor', { permissions: ['audit.view'], dshPreset: 'read-only' })
  const roles = new RolesService({
    pool: {},
    listRoleDefinitions: async () => [...roleStore.entries()].map(([name, v]) => ({ name, permissions: v.permissions, dshPreset: v.dshPreset })),
  } as never)
  await roles.onModuleInit()
  const reflector = { getAllAndOverride: () => 'audit.view' }
  const guard = new PermissionGuard(reflector as never, audit, roles)
  assert.equal(await guard.canActivate(fakeCtx({ sub: 'u-1', role: 'auditor' }) as never), true)
})
