import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RobotTextMessage } from 'dingtalk-stream'
import { ImService } from './im.service.js'
import { ImBindingsService } from './im-bindings.service.js'
import { PgStore } from '../store/pg.store.js'
import type { UsersService } from '../users/users.service.js'
import type { TasksService } from '../tasks/tasks.service.js'
import type { SessionsService } from '../sessions/sessions.service.js'
import type { AuditStore } from '../common/audit.store.js'
import type { DingtalkApi } from './dingtalk-api.js'

function makeIm() {
  const submits: { userId: string; presetId: string; text: string; sessionId?: string }[] = []
  const replies: string[] = []
  const sessionsCreated: { userId: string; presetId: string; id: string }[] = []
  const sessionStore = new Map<string, { id: string; userId: string; agentPresetId: string; status: string }>()

  const users = {
    findByExternal: () => ({ id: 'u-1', name: '测试', dept: 'IT', role: 'employee' }),
    upsert: async () => ({ id: 'u-1', name: '测试', dept: 'IT', role: 'employee' }),
  } as unknown as UsersService

  const tasks = {
    submit: async (userId: string, presetId: string, text: string, opts?: { sessionId?: string }) => {
      submits.push({ userId, presetId, text, sessionId: opts?.sessionId })
      return { id: `t-${submits.length}`, awaitingApproval: false }
    },
    get: async () => undefined,
  } as unknown as TasksService

  const sessions = {
    create: async (userId: string, agentPresetId: string) => {
      const id = `sess-${sessionsCreated.length + 1}`
      const s = { id, userId, agentPresetId, status: 'active' }
      sessionsCreated.push({ userId, presetId: agentPresetId, id })
      sessionStore.set(id, s)
      return s
    },
    get: async (id: string) => sessionStore.get(id),
  } as unknown as SessionsService

  const bindings = new ImBindingsService(new PgStore(undefined))
  const api = {
    staffToUnionId: async () => 'union-1',
    replyMarkdown: async (_wh: string, _title: string, text: string) => {
      replies.push(text)
    },
  } as unknown as DingtalkApi
  const audit = { append: async () => ({}) } as unknown as AuditStore
  const svc = new ImService(users, tasks, sessions, bindings, api, audit)
  return { svc, submits, replies, sessionsCreated, bindings }
}

function inbound(partial: Partial<RobotTextMessage> & { msgId: string; content: string }): RobotTextMessage {
  return {
    conversationId: 'cid-1',
    chatbotCorpId: 'c',
    chatbotUserId: 'bot',
    msgId: partial.msgId,
    senderNick: '测',
    isAdmin: false,
    senderStaffId: 'staff-1',
    sessionWebhookExpiredTime: Date.now() + 60_000,
    createAt: Date.now(),
    senderCorpId: 'corp',
    conversationType: '2',
    senderId: 's',
    sessionWebhook: 'https://example.com/hook',
    robotCode: 'r',
    msgtype: 'text',
    text: { content: partial.content },
    ...partial,
  } as RobotTextMessage
}

test('同一 msgId 只提交一次任务', async () => {
  const { svc, submits, bindings } = makeIm()
  await bindings.enable('hr-assistant', { keywords: ['请假'], priority: 1, agentName: '人事', agentStatus: 'published' })
  const msg = inbound({ msgId: 'msg-dup-1', content: '请假制度是什么' })
  await svc.handleInbound(msg)
  await svc.handleInbound(msg)
  assert.equal(submits.length, 1)
  assert.equal(submits[0]?.presetId, 'hr-assistant')
  assert.ok(submits[0]?.sessionId)
})

test('同 conversation 多轮复用 session', async () => {
  const { svc, submits, bindings } = makeIm()
  await bindings.enable('hr-assistant', { keywords: ['请假', '年假'], priority: 1, agentName: '人事', agentStatus: 'published' })
  await svc.handleInbound(inbound({ msgId: 'm1', content: '请假制度是什么', conversationId: 'cid-same' }))
  await svc.handleInbound(inbound({ msgId: 'm2', content: '年假有几天', conversationId: 'cid-same' }))
  assert.equal(submits.length, 2)
  assert.equal(submits[0]?.sessionId, submits[1]?.sessionId)
  assert.equal(submits[1]?.presetId, 'hr-assistant')
})

test('切换 preset 后新建 session', async () => {
  const { svc, submits, replies, bindings, sessionsCreated } = makeIm()
  await bindings.enable('hr-assistant', { keywords: ['请假'], priority: 1, agentName: '人事', agentStatus: 'published' })
  await bindings.enable('doc-search', { keywords: ['文档'], priority: 1, agentName: '文档', agentStatus: 'published' })
  await svc.handleInbound(inbound({ msgId: 'm1', content: '请假制度', conversationId: 'cid-sw' }))
  await svc.handleInbound(inbound({ msgId: 'm2', content: '切换 文档', conversationId: 'cid-sw' }))
  await svc.handleInbound(inbound({ msgId: 'm3', content: '随便问', conversationId: 'cid-sw' }))
  assert.equal(submits.length, 2)
  assert.equal(submits[0]?.presetId, 'hr-assistant')
  assert.equal(submits[1]?.presetId, 'doc-search')
  assert.notEqual(submits[0]?.sessionId, submits[1]?.sessionId)
  assert.ok(replies.some((r) => r.includes('已切换')))
  assert.ok(sessionsCreated.length >= 2)
})

test('多入口无关键词 → 不入队并提示', async () => {
  const { svc, submits, replies, bindings } = makeIm()
  await bindings.enable('a', { keywords: ['人事'], priority: 0, agentName: 'A', agentStatus: 'published' })
  await bindings.enable('b', { keywords: ['报表'], priority: 0, agentName: 'B', agentStatus: 'published' })
  await svc.handleInbound(inbound({ msgId: 'm1', content: '你好呀' }))
  assert.equal(submits.length, 0)
  assert.ok(replies.some((r) => r.includes('请指定')))
})

test('敏感操作拒绝不入队', async () => {
  const { svc, submits, replies, bindings } = makeIm()
  await bindings.enable('assistant', { keywords: [], priority: 0, agentName: '助手', agentStatus: 'published' })
  await svc.handleInbound(inbound({ msgId: 'm1', content: '删除所有数据' }))
  assert.equal(submits.length, 0)
  assert.ok(replies.some((r) => r.includes('敏感操作')))
})

test('无开通入口时帮助文案', async () => {
  const { svc, submits, replies } = makeIm()
  await svc.handleInbound(inbound({ msgId: 'm1', content: '帮助' }))
  assert.equal(submits.length, 0)
  assert.ok(replies.some((r) => r.includes('没有已开通')))
})
