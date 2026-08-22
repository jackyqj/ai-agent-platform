import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ScheduledTasksService } from './scheduled-tasks.service.js'
import type { PgStore } from '../store/pg.store.js'
import type { AuditStore } from '../common/audit.store.js'
import type { TasksService } from '../tasks/tasks.service.js'

// 单测走 mock PgStore/AuditStore/TasksService：断言 nextRun 的时区/cron 解析，以及运行日志/失败告警/审计。
function makeSvc(overrides: { pg?: Record<string, unknown>; tasks?: Record<string, unknown>; task?: Record<string, unknown> } = {}) {
  const runs: Record<string, unknown>[] = []
  const updates: Record<string, unknown>[] = []
  const pg = {
    insertScheduledTask: async () => {},
    listScheduledTasks: async () => [],
    getScheduledTask: async () => undefined,
    updateScheduledTask: async (id: string, p: Record<string, unknown>) => { updates.push({ id, ...p }) },
    deleteScheduledTask: async () => {},
    dueScheduledTasks: async () => [],
    insertScheduledRunLog: async (scheduledId: string, taskId: string | undefined, status: string, error?: string) => { runs.push({ scheduledId, taskId, status, error }) },
    listScheduledRunLogs: async () => [],
    ...overrides.pg,
  } as unknown as PgStore
  const events: Record<string, unknown>[] = []
  const audit = {
    append: async (ev: { eventType: string; payload: unknown }) => { events.push(ev); return ev as never },
  } as unknown as AuditStore
  const tasks = {
    submit: async () => ({ id: 't-1', status: 'queued', awaitingApproval: false }),
    ...overrides.tasks,
  } as unknown as TasksService
  const svc = new ScheduledTasksService(pg, audit, tasks)
  return { svc, pg: pg as unknown as Record<string, unknown>, audit, tasks, events, runs, updates }
}

const tz = 'Asia/Shanghai'

test('nextRun：daily HH:MM 按时区计算（Asia/Shanghai 无 DST）', () => {
  const { svc } = makeSvc()
  // 2026-08-22T00:00Z = 08:00 上海；daily 08:00 → 明天 08:00 上海
  assert.equal(svc.nextRun('daily 08:00', new Date('2026-08-22T00:00:00Z'), tz), '2026-08-23T00:00:00.000Z')
  // 已过 8 点（09:00 上海）→ 明天 08:00 上海
  assert.equal(svc.nextRun('daily 08:00', new Date('2026-08-22T01:00:00Z'), tz), '2026-08-23T00:00:00.000Z')
})

test('nextRun：daily HH:MM 在 UTC 直算', () => {
  const { svc } = makeSvc()
  assert.equal(svc.nextRun('daily 08:00', new Date('2026-08-22T00:00:00Z'), 'UTC'), '2026-08-22T08:00:00.000Z')
  assert.equal(svc.nextRun('daily 08:00', new Date('2026-08-22T09:00:00Z'), 'UTC'), '2026-08-23T08:00:00.000Z')
})

test('nextRun：5 段 cron 用 cron-parser 解析（含时区）', () => {
  const { svc } = makeSvc()
  assert.equal(svc.nextRun('*/15 * * * *', new Date('2026-08-22T00:00:00Z'), tz), '2026-08-22T00:15:00.000Z')
  assert.equal(svc.nextRun('0 8 * * *', new Date('2026-08-22T00:00:00Z'), 'UTC'), '2026-08-22T08:00:00.000Z')
  // cron 每周一 09:00 上海
  assert.equal(svc.nextRun('0 9 * * 1', new Date('2026-08-22T00:00:00Z'), tz), '2026-08-24T01:00:00.000Z')
})

test('nextRun：every <N>m/h 为时长、与时区无关', () => {
  const { svc } = makeSvc()
  assert.equal(svc.nextRun('every 30m', new Date('2026-08-22T00:00:00Z'), tz), '2026-08-22T00:30:00.000Z')
  assert.equal(svc.nextRun('every 2h', new Date('2026-08-22T00:00:00Z'), 'UTC'), '2026-08-22T02:00:00.000Z')
})

test('nextRun：非法格式抛错', () => {
  const { svc } = makeSvc()
  assert.throws(() => svc.nextRun('every 0m'), /间隔至少 1/)
  assert.throws(() => svc.nextRun('not-a-schedule'), /不支持的调度格式/)
})

test('create：默认 Asia/Shanghai；非法时区抛错', async () => {
  const { svc } = makeSvc()
  const t = await svc.create({ ownerUserId: 'u-1', name: 'n', schedule: 'daily 08:00', taskTemplate: 't' })
  assert.equal(t.timezone, 'Asia/Shanghai')
  assert.ok(t.nextRunAt)
  await assert.rejects(
    svc.create({ ownerUserId: 'u-1', name: 'n', schedule: 'daily 08:00', taskTemplate: 't', timezone: 'Not/AZone' }),
    /无效时区/,
  )
})

test('runNow：成功 → 记 fired 日志 + last_run_status', async () => {
  const task = { id: 's-1', ownerUserId: 'u-1', name: 'n', agentPresetId: 'assistant', schedule: 'every 1m', taskTemplate: 'hi', status: 'active', timezone: tz, createdAt: '' }
  const { svc, runs, updates, events } = makeSvc({ pg: { getScheduledTask: async () => task } })
  const r = await svc.runNow('s-1')
  assert.equal(r.ok, true)
  assert.equal(runs.length, 1)
  assert.equal(runs[0].status, 'fired')
  assert.equal(runs[0].taskId, 't-1')
  assert.ok(updates.some((u) => u.lastRunStatus === 'fired'), '应更新 last_run_status=fired')
  assert.ok(events.some((e) => e.eventType === 'scheduled.manual-run'), '追手动运行审计')
})

test('runNow：submit 抛错 → 记 failed 日志 + 审计 scheduled.failure（带归属）', async () => {
  const task = { id: 's-1', ownerUserId: 'u-1', name: 'n', agentPresetId: 'assistant', schedule: 'every 1m', taskTemplate: 'hi', status: 'active', timezone: tz, createdAt: '' }
  const { svc, runs, events } = makeSvc({
    pg: { getScheduledTask: async () => task },
    tasks: { submit: async () => { throw new Error('配额已用尽') } },
  })
  const r = await svc.runNow('s-1')
  assert.equal(r.ok, false)
  assert.equal(r.detail, '触发失败：配额已用尽')
  assert.equal(runs.length, 1)
  assert.equal(runs[0].status, 'failed')
  assert.equal((runs[0].error as string).includes('配额已用尽'), true)
  const failAudit = events.find((e) => e.eventType === 'scheduled.failure') as { userId?: string; eventType: string }
  assert.ok(failAudit, '失败应审计 scheduled.failure')
  assert.equal(failAudit.userId, 'u-1', '失败审计应带 ownerUserId 归属')
})

test('runNow：等待审批 → 记 awaiting 状态（非 fired）', async () => {
  const task = { id: 's-1', ownerUserId: 'u-1', name: 'n', agentPresetId: 'assistant', schedule: 'every 1m', taskTemplate: 'hi', status: 'active', timezone: tz, createdAt: '' }
  const { svc, runs } = makeSvc({
    pg: { getScheduledTask: async () => task },
    tasks: { submit: async () => ({ id: 't-1', status: 'queued', awaitingApproval: true }) },
  })
  const r = await svc.runNow('s-1')
  assert.equal(r.ok, true)
  assert.equal(runs[0].status, 'awaiting')
})

test('tick：到期触发记日志 + 滚动 next_run_at', async () => {
  const task = { id: 's-1', ownerUserId: 'u-1', name: 'n', agentPresetId: 'assistant', schedule: 'every 1m', taskTemplate: 'hi', status: 'active', timezone: tz, createdAt: '' }
  const { svc, runs, updates, events } = makeSvc({
    pg: {
      dueScheduledTasks: async () => [{ id: 's-1', ownerUserId: 'u-1', agentPresetId: 'assistant', taskTemplate: 'hi' }],
      getScheduledTask: async () => task,
    },
  })
  const fired = await svc.tick()
  assert.equal(fired, 1)
  assert.equal(runs.length, 1)
  assert.equal(runs[0].status, 'fired')
  assert.ok(updates.some((u) => u.nextRunAt), 'tick 应滚动 next_run_at')
  assert.ok(events.some((e) => e.eventType === 'scheduled.fired'), 'tick 应审计 scheduled.fired')
})

test('tick：submit 抛错 → 记 failed 日志（失败不计数）', async () => {
  const task = { id: 's-1', ownerUserId: 'u-1', name: 'n', agentPresetId: 'assistant', schedule: 'every 1m', taskTemplate: 'hi', status: 'active', timezone: tz, createdAt: '' }
  const { svc, runs, events, updates } = makeSvc({
    pg: {
      dueScheduledTasks: async () => [{ id: 's-1', ownerUserId: 'u-1', agentPresetId: 'assistant', taskTemplate: 'hi' }],
      getScheduledTask: async () => task,
    },
    tasks: { submit: async () => { throw new Error('boom') } },
  })
  const fired = await svc.tick()
  assert.equal(fired, 0, '失败不计入 fired')
  assert.equal(runs.length, 1)
  assert.equal(runs[0].status, 'failed')
  assert.ok(events.some((e) => e.eventType === 'scheduled.failure'))
  assert.ok(updates.some((u) => u.nextRunAt), '失败仍滚动 next_run_at')
})

test('tick：等待审批 → 记 awaiting 且不计 fired', async () => {
  const task = { id: 's-1', ownerUserId: 'u-1', name: 'n', agentPresetId: 'assistant', schedule: 'every 1m', taskTemplate: 'hi', status: 'active', timezone: tz, createdAt: '' }
  const { svc, runs } = makeSvc({
    pg: {
      dueScheduledTasks: async () => [{ id: 's-1', ownerUserId: 'u-1', agentPresetId: 'assistant', taskTemplate: 'hi' }],
      getScheduledTask: async () => task,
    },
    tasks: { submit: async () => ({ id: 't-1', status: 'queued', awaitingApproval: true }) },
  })
  const fired = await svc.tick()
  assert.equal(fired, 0, '等待审批不计入 fired')
  assert.equal(runs[0].status, 'awaiting')
})
