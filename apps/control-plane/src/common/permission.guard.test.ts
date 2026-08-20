import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import { AuditStore } from './audit.store.js'
import { PermissionGuard } from './permission.guard.js'
import { PgStore } from '../store/pg.store.js'
import { PERMISSION_KEY } from './require-permission.decorator.js'

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
  const guard = new PermissionGuard(reflector as never, audit)

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
  const guard = new PermissionGuard(reflector as never, audit)
  assert.equal(await guard.canActivate(fakeCtx({ sub: 'u-hr-1', role: 'employee' }) as never), true)
  assert.equal(PERMISSION_KEY, 'permission')
})
