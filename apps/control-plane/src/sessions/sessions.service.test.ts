import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AuditStore } from '../common/audit.store.js'
import { InstancesService } from '../instances/instances.service.js'
import { PgStore } from '../store/pg.store.js'
import { SessionsService } from './sessions.service.js'

function makeSessions() {
  const pg = new PgStore(undefined)
  const instances = new InstancesService(pg)
  const audit = new AuditStore(pg)
  return { sessions: new SessionsService(instances, audit, pg), instances, audit }
}

test('admin list returns other users sessions without routing secrets', async () => {
  const { sessions } = makeSessions()
  await sessions.create('u-hr-1', 'assistant')
  await sessions.create('u-dev-1', 'hr-assistant')
  const all = await sessions.listAdmin({})
  assert.equal(all.length, 2)
  assert.ok(all.every((s) => !('routingSecret' in s)))
  const mine = await sessions.listAdmin({ userId: 'u-hr-1' })
  assert.equal(mine.length, 1)
  assert.equal(mine[0]?.userId, 'u-hr-1')
})

test('admin list filters by time window', async () => {
  const { sessions } = makeSessions()
  await sessions.create('u-hr-1', 'assistant')
  const future = new Date(Date.now() + 60_000).toISOString()
  assert.equal((await sessions.listAdmin({ from: future })).length, 0)
  const past = new Date(Date.now() - 60_000).toISOString()
  assert.equal((await sessions.listAdmin({ from: past })).length, 1)
})

test('closeAllForUser closes sessions and reclaims the instance', async () => {
  const { sessions, instances } = makeSessions()
  const s = await sessions.create('u-hr-1', 'assistant')
  assert.equal((await instances.list()).length, 1)
  await sessions.closeAllForUser('u-hr-1')
  assert.equal((await sessions.listForUser('u-hr-1')).length, 0)
  assert.equal((await sessions.get(s.id))?.status, 'closed')
  assert.equal((await instances.list()).length, 0)
})
