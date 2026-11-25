import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ImBindingsService } from './im-bindings.service.js'
import { PgStore } from '../store/pg.store.js'

function makeSvc() {
  const pg = new PgStore(undefined)
  return new ImBindingsService(pg)
}

test('route: 关键词命中最高 priority', async () => {
  const svc = makeSvc()
  await svc.enable('low', { keywords: ['请假'], priority: 1, agentName: '低', agentStatus: 'published' })
  await svc.enable('high', { keywords: ['请假'], priority: 10, agentName: '高', agentStatus: 'published' })
  const enabled = await svc.listEnabled()
  const r = svc.route('请问请假制度', enabled)
  assert.equal(r.kind, 'preset')
  if (r.kind === 'preset') assert.equal(r.presetId, 'high')
})

test('route: 无关键词且仅一个入口 → 该入口', async () => {
  const svc = makeSvc()
  await svc.enable('only', { keywords: [], priority: 0, agentName: '唯一', agentStatus: 'published' })
  const r = svc.route('随便问问', await svc.listEnabled())
  assert.deepEqual(r, { kind: 'preset', presetId: 'only' })
})

test('route: 无关键词且多个入口 → ambiguous', async () => {
  const svc = makeSvc()
  await svc.enable('a', { keywords: ['人事'], priority: 0, agentName: 'A', agentStatus: 'published' })
  await svc.enable('b', { keywords: ['报表'], priority: 0, agentName: 'B', agentStatus: 'published' })
  const r = svc.route('你好', await svc.listEnabled())
  assert.equal(r.kind, 'ambiguous')
  if (r.kind === 'ambiguous') assert.equal(r.agents.length, 2)
})

test('route: 无开通 → none', () => {
  const svc = makeSvc()
  assert.deepEqual(svc.route('hi', []), { kind: 'none' })
})

test('resolveEnabled 按 id / 名称', async () => {
  const svc = makeSvc()
  await svc.enable('hr-assistant', { keywords: ['假'], priority: 0, agentName: '人事助手', agentStatus: 'published' })
  const enabled = await svc.listEnabled()
  assert.equal(svc.resolveEnabled('hr-assistant', enabled)?.presetId, 'hr-assistant')
  assert.equal(svc.resolveEnabled('人事助手', enabled)?.presetId, 'hr-assistant')
  assert.equal(svc.resolveEnabled('nope', enabled), undefined)
})

test('conversation upsert 可复用', async () => {
  const svc = makeSvc()
  await svc.upsertConversation({
    conversationId: 'cid-1',
    userId: 'u-1',
    presetId: 'assistant',
    sessionId: '11111111-1111-4111-8111-111111111111',
    convType: '2',
  })
  const row = await svc.getConversation('cid-1', 'u-1')
  assert.equal(row?.presetId, 'assistant')
  assert.equal(row?.sessionId, '11111111-1111-4111-8111-111111111111')
})

test('disable 幂等', async () => {
  const svc = makeSvc()
  await svc.enable('x', { keywords: [], agentName: 'X', agentStatus: 'published' })
  await svc.disable('x')
  assert.equal((await svc.listEnabled()).length, 0)
  const again = await svc.disable('x')
  assert.equal(again?.enabled, false)
})
