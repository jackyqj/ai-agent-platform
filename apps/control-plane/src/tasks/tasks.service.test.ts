import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AuditStore } from '../common/audit.store.js'
import { ApprovalService } from '../approvals/approval.service.js'
import { PermissionPolicyService } from '../common/permission-policy.service.js'
import { RolesService } from '../common/roles.service.js'
import { QuotaService } from '../quota/quota.service.js'
import { SessionsService } from '../sessions/sessions.service.js'
import { InstancesService } from '../instances/instances.service.js'
import { UsersService } from '../users/users.service.js'
import { PgStore } from '../store/pg.store.js'
import type { AgentsService } from '../agents/agents.service.js'
import { TasksService } from './tasks.service.js'

function makeTasks() {
  const pg = new PgStore(undefined)
  const audit = new AuditStore(pg)
  const roles = new RolesService(pg)
  const users = new UsersService(pg, roles)
  const policies = new PermissionPolicyService(roles)
  const agents = {
    get: async () => ({ approvalLevel: 'none' }),
  } as unknown as AgentsService
  const approvals = new ApprovalService(pg, audit, agents)
  const quota = new QuotaService(pg, audit)
  ;(quota as unknown as { checkAndRecord: () => Promise<{ blocked: boolean }> }).checkAndRecord = async () => ({
    blocked: false,
  })
  const instances = new InstancesService(pg)
  const sessions = new SessionsService(instances, audit, pg)
  const tasks = new TasksService(pg, audit, approvals, quota, users, policies, sessions)
  // Avoid Redis enqueue in unit tests
  ;(tasks as unknown as { enqueue: (id: string) => Promise<void> }).enqueue = async () => undefined
  return { tasks, sessions }
}

test('submit stores store sessionId on the task payload for DSH reuse', async () => {
  const { tasks, sessions } = makeTasks()
  const s = await sessions.create('u-admin', 'assistant')
  const rec = await tasks.submit('u-admin', 'assistant', '第二轮问题', { sessionId: s.id })
  assert.equal(rec.payload.sessionId, s.id)
  const got = await tasks.get(rec.id)
  assert.equal(got?.payload.sessionId, s.id)
})

test('submit rejects a session that is not owned by the caller', async () => {
  const { tasks, sessions } = makeTasks()
  const s = await sessions.create('u-hr-1', 'assistant')
  await assert.rejects(
    () => tasks.submit('u-admin', 'assistant', 'hi', { sessionId: s.id }),
    /session not found/,
  )
})

test('submit without sessionId keeps one-shot isolation (no payload.sessionId)', async () => {
  const { tasks } = makeTasks()
  const rec = await tasks.submit('u-admin', 'assistant', 'cron/im one-shot')
  assert.equal(rec.payload.sessionId, undefined)
})
