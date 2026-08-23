import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RobotTextMessage } from 'dingtalk-stream'
import { ImService } from './im.service.js'
import type { UsersService } from '../users/users.service.js'
import type { TasksService } from '../tasks/tasks.service.js'
import type { AuditStore } from '../common/audit.store.js'
import type { DingtalkApi } from './dingtalk-api.js'

function makeIm(overrides: {
  submit?: (userId: string, presetId: string, text: string) => Promise<{ id: string; awaitingApproval?: boolean }>
} = {}) {
  const submits: { userId: string; presetId: string; text: string }[] = []
  const replies: string[] = []
  const users = {
    findByExternal: () => ({ id: 'u-1', name: '测试', dept: 'IT', role: 'employee' }),
    upsert: async () => ({ id: 'u-1', name: '测试', dept: 'IT', role: 'employee' }),
  } as unknown as UsersService
  const tasks = {
    submit: async (userId: string, presetId: string, text: string) => {
      submits.push({ userId, presetId, text })
      if (overrides.submit) return overrides.submit(userId, presetId, text)
      return { id: `t-${submits.length}`, awaitingApproval: false }
    },
    get: async () => undefined,
  } as unknown as TasksService
  const api = {
    staffToUnionId: async () => 'union-1',
    replyMarkdown: async (_wh: string, _title: string, text: string) => { replies.push(text) },
  } as unknown as DingtalkApi
  const audit = { append: async () => ({}) } as unknown as AuditStore
  const svc = new ImService(users, tasks, api, audit)
  return { svc, submits, replies }
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

test('同一 msgId 只提交一次任务（钉钉 Stream 重推兜底）', async () => {
  const { svc, submits } = makeIm()
  const msg = inbound({ msgId: 'msg-dup-1', content: '请假制度是什么' })
  await svc.handleInbound(msg)
  await svc.handleInbound(msg)
  assert.equal(submits.length, 1, '重复 msgId 不应再次 submit')
  assert.equal(submits[0]?.text, '请假制度是什么')
})

test('不同 msgId 各自提交', async () => {
  const { svc, submits } = makeIm()
  await svc.handleInbound(inbound({ msgId: 'msg-a', content: '请假制度是什么' }))
  await svc.handleInbound(inbound({ msgId: 'msg-b', content: '年假有几天' }))
  assert.equal(submits.length, 2)
})
