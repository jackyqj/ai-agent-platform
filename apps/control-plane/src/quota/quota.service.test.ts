import assert from 'node:assert/strict'
import { test } from 'node:test'
import { QuotaService } from './quota.service.js'
import type { PgStore } from '../store/pg.store.js'
import type { AuditStore } from '../common/audit.store.js'

// 单测走 mock PgStore/AuditStore：quota 的 store 方法无内存回退（与 agents 的 memory 路径不同），
// 这里直接注入可控 mock，断言 warn/reject/resolve 的落库与审计行为。
function makeService(overrides: Record<string, unknown> = {}) {
  const pg = {
    listQuotaPolicies: async () => [],
    getUsage: async () => 0,
    bumpUsage: async () => {},
    insertQuotaAlert: async () => true,
    hasOpenQuotaAlert: async () => false,
    listQuotaAlerts: async () => [],
    resolveQuotaAlert: async () => true,
    countOpenQuotaAlerts: async () => 0,
    ...overrides,
  } as unknown as PgStore
  const events: Record<string, unknown>[] = []
  const audit = {
    append: async (ev: { eventType: string; payload: unknown }) => {
      events.push(ev)
      return ev as never
    },
  } as unknown as AuditStore
  const svc = new QuotaService(pg, audit)
  return { svc, pg, events }
}

const dayPolicy = {
  id: 'p-all', scopeType: 'all', period: 'day', budgetRequests: 2, overPolicy: 'reject',
}

test('不超限：allowed + 记账 bumpUsage', async () => {
  let bumped = 0
  const { svc } = makeService({
    listQuotaPolicies: async () => [dayPolicy],
    getUsage: async () => 1,
    bumpUsage: async () => { bumped += 1 },
  })
  const r = await svc.checkAndRecord('u-1', undefined)
  assert.equal(r.allowed, true)
  assert.equal(r.blocked, false)
  assert.equal(r.used, 2)
  assert.equal(r.budget, 2)
  assert.equal(r.policy?.id, 'p-all')
  assert.equal(bumped, 1, '超限前应记账')
})

test('超限 + reject：应拒绝（blocked=true）且不落告警、不审计', async () => {
  let inserts = 0
  const { svc, events } = makeService({
    listQuotaPolicies: async () => [dayPolicy],
    getUsage: async () => 2,
    insertQuotaAlert: async () => { inserts += 1; return true },
  })
  const r = await svc.checkAndRecord('u-1', undefined)
  assert.equal(r.allowed, false)
  assert.equal(r.blocked, true, 'reject 超限应拒绝')
  assert.equal(inserts, 0, 'reject 不落告警')
  assert.equal(events.length, 0, 'reject 不产生 quota.warn 审计')
})

test('超限 + warn：放行（blocked=false）+ 落告警 + 审计 quota.warn', async () => {
  const alerts: Record<string, unknown>[] = []
  const { svc, pg, events } = makeService({
    listQuotaPolicies: async () => [{ ...dayPolicy, overPolicy: 'warn' }],
    getUsage: async () => 2,
    insertQuotaAlert: async (a: Record<string, unknown>) => { alerts.push(a); return true },
  })
  void pg
  const r = await svc.checkAndRecord('u-1', undefined)
  assert.equal(r.allowed, false, 'warn 超限时 allowed 仍表示超限')
  assert.equal(r.blocked, false, 'warn 超限应放行（不拒绝）')
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].usedRequests, 2)
  assert.equal(alerts[0].budgetRequests, 2)
  assert.equal(alerts[0].period, 'day')
  assert.equal(events.length, 1)
  assert.equal(events[0].eventType, 'quota.warn')
  const pl = events[0].payload as { used: number; budget: number }
  assert.equal(pl.used, 2)
  assert.equal(pl.budget, 2)
})

test('超限 + warn 但已有未处置告警：去重，不重复落告警', async () => {
  const alerts: Record<string, unknown>[] = []
  const { svc, events } = makeService({
    listQuotaPolicies: async () => [{ ...dayPolicy, overPolicy: 'warn' }],
    getUsage: async () => 3,
    hasOpenQuotaAlert: async () => true,
    insertQuotaAlert: async (a: Record<string, unknown>) => { alerts.push(a) },
  })
  await svc.checkAndRecord('u-1', undefined)
  assert.equal(alerts.length, 0, '存在未处置告警时不重复落库')
  assert.equal(events.length, 0)
})

test('warn 落库失败 fail-soft：不抛错、不阻断主流程', async () => {
  const { svc } = makeService({
    listQuotaPolicies: async () => [{ ...dayPolicy, overPolicy: 'warn' }],
    getUsage: async () => 2,
    hasOpenQuotaAlert: async () => { throw new Error('db down') },
  })
  const r = await svc.checkAndRecord('u-1', undefined)
  assert.equal(r.allowed, false)
  assert.equal(r.blocked, false, 'warn 落库失败仍放行（fail-soft）')
})

test('resolve 优先 user → dept → all（传 dept 才能命中部门级）', async () => {
  const { svc } = makeService({
    listQuotaPolicies: async () => [
      { id: 'p-all', scopeType: 'all', period: 'day', budgetRequests: 20, overPolicy: 'reject' },
      { id: 'p-dept', scopeType: 'dept', scopeId: 'HR/行政', period: 'day', budgetRequests: 3, overPolicy: 'reject' },
      { id: 'p-user', scopeType: 'user', scopeId: 'u-hr-1', period: 'day', budgetRequests: 1, overPolicy: 'reject' },
    ],
    getUsage: async () => 0,
    bumpUsage: async () => {},
  })
  // user 命中：无 dept 也命中用户级
  const rUser = await svc.checkAndRecord('u-hr-1', 'HR/行政')
  assert.equal(rUser.policy?.id, 'p-user')
  // 无用户级 → dept 命中（需要传 dept）
  const rDept = await svc.checkAndRecord('u-hr-2', 'HR/行政')
  assert.equal(rDept.policy?.id, 'p-dept')
  // 无 dept 时部门级不命中 → 落到 all
  const rNoDept = await svc.checkAndRecord('u-hr-2', undefined)
  assert.equal(rNoDept.policy?.id, 'p-all')
})

test('resolveAlert：处置成功追审计 quota.alert.resolved', async () => {
  const { svc, pg, events } = makeService({
    resolveQuotaAlert: async () => true,
  })
  const r = await svc.resolveAlert('a-1', 'admin')
  assert.equal(r.ok, true)
  assert.equal(events.length, 1)
  assert.equal(events[0].eventType, 'quota.alert.resolved')
  const pl = events[0].payload as { alertId: string }
  assert.equal(pl.alertId, 'a-1')
})

test('resolveAlert：已处置/不存在 → ok=false 不审计', async () => {
  const { svc, events } = makeService({ resolveQuotaAlert: async () => false })
  const r = await svc.resolveAlert('a-1', 'admin')
  assert.equal(r.ok, false)
  assert.equal(events.length, 0)
})
