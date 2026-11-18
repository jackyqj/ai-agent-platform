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

test('create returns a logical rpc session without spawning an instance', async () => {
  const { sessions, instances } = makeSessions()
  const s = await sessions.create('u-hr-1', 'assistant')
  // 主信号：逻辑会话行。instances.list() 为空只是辅信号（防回归 spawn），单独不足以证明插入成功。
  assert.equal(s.type, 'rpc')
  assert.equal(s.instanceId, undefined)
  assert.equal(s.status, 'active')
  assert.equal((await instances.list()).length, 0)
  assert.equal((await sessions.listForUser('u-hr-1')).length, 1)
})

test('closeAllForUser closes rpc sessions without touching instances', async () => {
  const { sessions, instances } = makeSessions()
  const s = await sessions.create('u-hr-1', 'assistant')
  await sessions.closeAllForUser('u-hr-1')
  assert.equal((await sessions.listForUser('u-hr-1')).length, 0)
  assert.equal((await sessions.get(s.id))?.status, 'closed')
  assert.equal((await instances.list()).length, 0)
})

test('close stops a leftover web instance when the session carries instanceId', async () => {
  const { sessions, instances } = makeSessions()
  const s = await sessions.create('u-hr-1', 'assistant')
  // 无写入 API；内存回退下返回对象与内部 Map 同源，直接补一个存量实例 id 覆盖 `if (s.instanceId) stop`
  const inst = await instances.getOrCreateWebInstance({ userId: 'u-hr-1', env: {} })
  s.instanceId = inst.id
  assert.equal((await instances.list()).length, 1)
  await sessions.close(s.id, 'u-hr-1')
  assert.equal((await sessions.get(s.id))?.status, 'closed')
  assert.equal((await instances.list()).length, 0)
})
