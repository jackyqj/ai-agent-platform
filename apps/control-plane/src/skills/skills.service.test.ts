import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AuditStore } from '../common/audit.store.js'
import { RolesService } from '../common/roles.service.js'
import { PgStore } from '../store/pg.store.js'
import { UsersService } from '../users/users.service.js'
import { NotificationsService } from './notifications.service.js'
import { SkillsService } from './skills.service.js'
import { SkillsError, type SkillActor } from './types.js'

function harness() {
  const pg = new PgStore(undefined)
  const roles = new RolesService(pg)
  const users = new UsersService(pg, roles)
  const inbox = new NotificationsService(pg)
  const skills = new SkillsService(pg, new AuditStore(pg), users, roles, inbox)
  return { skills, inbox, users }
}

const employee: SkillActor = { id: 'u-hr-1', role: 'employee', dept: 'HR/行政' }
const employee2: SkillActor = { id: 'u-biz-1', role: 'employee', dept: '业务部' }
const developer: SkillActor = { id: 'u-dev-1', role: 'developer', dept: '研发部' }
const admin: SkillActor = { id: 'u-admin', role: 'admin', dept: 'IT部' }

test('create starts as draft; other employees cannot see it', async () => {
  const { skills } = harness()
  const created = await skills.create({ slug: 'leave-faq', title: '请假 FAQ', body: '第一句。' }, employee)
  assert.equal(created.status, 'draft')
  const mine = await skills.list(employee)
  assert.equal(mine.length, 1)
  const others = await skills.list(employee2)
  assert.equal(others.length, 0)
})

test('submit notifies reviewers; approve publishes and reject returns to draft', async () => {
  const { skills, inbox } = harness()
  const s = await skills.create({ slug: 'hr-guide', title: '入职指南', body: '欢迎。' }, employee)
  await skills.submit(s.id, employee)
  assert.equal((await skills.get(s.id, employee)).status, 'pending')

  const forDev = await inbox.list(developer.id)
  assert.ok(forDev.unread >= 1)
  assert.equal(forDev.notifications[0]?.kind, 'skill.submitted')

  const versions = await skills.listVersions(s.id, developer)
  assert.equal(versions[0]?.status, 'pending')
  await skills.review(s.id, versions[0]!.id, 'approve', developer, 'ok')
  assert.equal((await skills.get(s.id, employee2)).status, 'published')

  const after = await inbox.list(employee.id)
  assert.ok(after.notifications.some((n) => n.kind === 'skill.reviewed'))

  const s2 = await skills.create({ slug: 'bad-skill', title: '坏技能', body: 'x' }, employee)
  await skills.submit(s2.id, employee)
  const pending = (await skills.listVersions(s2.id, developer))[0]!
  await skills.review(s2.id, pending.id, 'reject', developer, '不够清楚')
  assert.equal((await skills.get(s2.id, employee)).status, 'draft')
})

test('department visibility hides published skill from other depts', async () => {
  const { skills } = harness()
  const s = await skills.create({
    slug: 'hr-only', title: 'HR 内部', body: '密', visibility: 'department', departmentId: 'HR/行政',
  }, employee)
  await skills.submit(s.id, employee)
  const vid = (await skills.listVersions(s.id, developer))[0]!.id
  await skills.review(s.id, vid, 'approve', developer)
  assert.equal((await skills.listPublished(employee)).length, 1)
  assert.equal((await skills.listPublished(employee2)).length, 0)
  await assert.rejects(() => skills.get(s.id, employee2), (e: unknown) => e instanceof SkillsError && e.httpStatus === 404)
})

test('feedback recast updates Wilson score; one vote per user', async () => {
  const { skills } = harness()
  const s = await skills.create({ slug: 'rated', title: '评分', body: '正文' }, employee)
  await skills.submit(s.id, employee)
  await skills.review(s.id, (await skills.listVersions(s.id, developer))[0]!.id, 'approve', developer)
  await skills.setFeedback(s.id, 'like', employee)
  await skills.setFeedback(s.id, 'like', employee2)
  let row = await skills.get(s.id, employee)
  assert.equal(row.likeCount, 2)
  assert.equal(row.dislikeCount, 0)
  const firstScore = row.score
  await skills.setFeedback(s.id, 'dislike', employee)
  row = await skills.get(s.id, employee)
  assert.equal(row.likeCount, 1)
  assert.equal(row.dislikeCount, 1)
  assert.ok(row.score < firstScore)
  const sum = await skills.feedbackSummary(s.id, employee)
  assert.equal(sum.mine, 'dislike')
  assert.equal(sum.stars, Math.round(row.score * 50) / 10)
})

test('change request notifies author; handle notifies requester; new publish marks 随 vX', async () => {
  const { skills, inbox } = harness()
  const s = await skills.create({ slug: 'rewrite-me', title: '改稿', body: '旧句。' }, employee)
  await skills.submit(s.id, employee)
  const v1 = (await skills.listVersions(s.id, developer))[0]!
  await skills.review(s.id, v1.id, 'approve', developer)

  const cr = await skills.addChangeRequest(s.id, {
    lineNo: 1, originalText: '旧句。', suggestedText: '新句。', reason: '更清楚',
  }, employee2)
  assert.equal(cr.status, 'open')
  assert.ok((await inbox.list(employee.id)).notifications.some((n) => n.kind === 'change_request.opened'))

  await skills.handleChangeRequest(cr.id, 'adopted', employee, '会改')
  assert.ok((await inbox.list(employee2.id)).notifications.some((n) => n.kind === 'change_request.handled'))

  const cr2 = await skills.addChangeRequest(s.id, {
    lineNo: 1, originalText: '旧句。', suggestedText: '另一句。',
  }, employee2)
  await skills.addVersion(s.id, { version: '0.2.0', body: '新句。' }, employee)
  const v2 = (await skills.listVersions(s.id, developer)).find((v) => v.version === '0.2.0')!
  await skills.review(s.id, v2.id, 'approve', developer)
  const still = (await skills.listChangeRequests(s.id, employee)).find((c) => c.id === cr2.id)
  assert.equal(still?.resolvedVersion, '0.2.0')
})

test('plugin list only returns published skills the JWT user can see', async () => {
  const { skills } = harness()
  await skills.create({ slug: 'draft-hidden', title: '草稿', body: 'x' }, employee)
  const pub = await skills.create({ slug: 'public-one', title: '公开', body: 'y' }, employee)
  await skills.submit(pub.id, employee)
  await skills.review(pub.id, (await skills.listVersions(pub.id, developer))[0]!.id, 'approve', developer)
  const listed = await skills.listPublished(employee2)
  assert.deepEqual(listed.map((s) => s.slug), ['public-one'])
})

test('archive is admin-only and hides from the catalog', async () => {
  const { skills } = harness()
  const s = await skills.create({ slug: 'gone', title: '下架', body: 'z' }, employee)
  await skills.submit(s.id, employee)
  await skills.review(s.id, (await skills.listVersions(s.id, developer))[0]!.id, 'approve', developer)
  await assert.rejects(() => skills.archive(s.id, employee), /无权下架/)
  await skills.archive(s.id, admin)
  assert.equal((await skills.listPublished(employee2)).length, 0)
})

test('marking notifications read is idempotent and scoped to the user', async () => {
  const { skills, inbox } = harness()
  const s = await skills.create({ slug: 'n1', title: '通知', body: 'a' }, employee)
  await skills.submit(s.id, employee)
  const before = await inbox.list(developer.id)
  assert.ok(before.unread > 0)
  const after = await inbox.markRead(developer.id)
  assert.equal(after.unread, 0)
  const again = await inbox.markRead(developer.id)
  assert.equal(again.unread, 0)
  assert.equal((await inbox.list(admin.id)).unread > 0, true)
})
