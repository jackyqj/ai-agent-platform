import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApprovalService } from './approval.service.js'
import type { PgStore } from '../store/pg.store.js'
import type { AuditStore } from '../common/audit.store.js'
import type { AgentsService } from '../agents/agents.service.js'

// 单测走 mock PgStore/AuditStore/AgentsService：断言多级审批链的构建、逐级推进、角色校验与入队。
// pg.pool 非空 → persist()=true（走 PG 分支）。
function makeSvc(agents: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  const store = new Map<string, Record<string, unknown>>()
  const pg = {
    pool: {},
    findActiveGrant: async () => false,
    getAgentApprovalChain: async () => [],
    insertApproval: async (a: Record<string, unknown>) => store.set(String(a.id), a),
    getApproval: async (id: string) => store.get(id),
    updateApproval: async (id: string, p: Record<string, unknown>) => { const r = store.get(id); if (r) Object.assign(r, p, { decidedAt: new Date().toISOString() }) },
    listApprovals: async () => [...store.values()],
    ...overrides,
  } as unknown as PgStore
  const events: Record<string, unknown>[] = []
  const audit = { append: async (ev: { eventType: string; payload: unknown }) => { events.push(ev); return ev as never } } as unknown as AuditStore
  const svc = new ApprovalService(pg, audit, agents as unknown as AgentsService)
  return { svc, store, events }
}

const managerAgent = { name: '报表助手', approvalLevel: 'manager' }
const selfAgent = { name: '通用助手', approvalLevel: 'self' }

test('gateTask：manager 默认链为 admin', async () => {
  const { svc, store } = makeSvc({ get: async () => managerAgent }, { getAgentApprovalChain: async () => [] })
  const r = await svc.gateTask('u-1', 'report-builder', '出报表', 'task-1')
  assert.equal(r.granted, false)
  assert.deepEqual(r.approval?.chain, ['admin'])
  assert.equal(r.approval?.currentLevel, 0)
})

test('gateTask：manager 使用 Agent 的审批链', async () => {
  const { svc, store } = makeSvc({ get: async () => managerAgent }, { getAgentApprovalChain: async () => ['developer', 'admin'] })
  const r = await svc.gateTask('u-1', 'report-builder', '出报表', 'task-1')
  assert.deepEqual(r.approval?.chain, ['developer', 'admin'])
  assert.equal(r.approval?.currentLevel, 0)
})

test('decide：单级链 admin 批准 → approved + 入队', async () => {
  const enqueue: string[] = []
  const { svc, store } = makeSvc({ get: async () => managerAgent })
  const g = await svc.gateTask('u-1', 'report-builder', '出报表', 'task-1')
  const id = g.approval!.id
  const a = await svc.decide(id, true, 'u-admin', 'admin', async (t) => { enqueue.push(t) })
  assert.equal(a?.status, 'approved')
  assert.deepEqual(enqueue, ['task-1'])
})

test('decide：多级链逐级推进，全链通过才入队', async () => {
  const enqueue: string[] = []
  const { svc } = makeSvc({ get: async () => managerAgent }, { getAgentApprovalChain: async () => ['developer', 'admin'] })
  const g = await svc.gateTask('u-1', 'report-builder', '出报表', 'task-1')
  const id = g.approval!.id
  // 第一级：developer 批准 → 仍 pending，推进到 level 1，不入队
  const a1 = await svc.decide(id, true, 'u-dev', 'developer', async (t) => { enqueue.push(t) })
  assert.equal(a1?.status, 'pending', '第一级不终态')
  assert.equal(a1?.currentLevel, 1, '推进到下一级')
  assert.equal(enqueue.length, 0, '未到末级不入队')
  // 第二级：admin 批准 → approved + 入队
  const a2 = await svc.decide(id, true, 'u-admin', 'admin', async (t) => { enqueue.push(t) })
  assert.equal(a2?.status, 'approved')
  assert.deepEqual(enqueue, ['task-1'])
})

test('decide：当前层级角色不符 → 抛错', async () => {
  const { svc } = makeSvc({ get: async () => managerAgent }, { getAgentApprovalChain: async () => ['developer', 'admin'] })
  const g = await svc.gateTask('u-1', 'report-builder', '出报表', 'task-1')
  await assert.rejects(
    () => svc.decide(g.approval!.id, true, 'u-emp', 'employee', async () => {}),
    /当前层级需 developer 审批/,
  )
})

test('decide：拒绝 → rejected，不入队', async () => {
  const enqueue: string[] = []
  const { svc } = makeSvc({ get: async () => managerAgent })
  const g = await svc.gateTask('u-1', 'report-builder', '出报表', 'task-1')
  const a = await svc.decide(g.approval!.id, false, 'u-admin', 'admin', async (t) => { enqueue.push(t) })
  assert.equal(a?.status, 'rejected')
  assert.equal(enqueue.length, 0)
})

test('gateTask：self 无授权 → pending；授权命中 → granted', async () => {
  const { svc, store } = makeSvc({ get: async () => selfAgent }, { findActiveGrant: async () => true })
  const r = await svc.gateTask('u-1', 'assistant', 'hello', 'task-1')
  assert.equal(r.granted, true, '自授权命中直接放行')
})
