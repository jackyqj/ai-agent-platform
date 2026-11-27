import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inquiryFromRequest, waitForInquiryAnswer } from './inquiry.ts'

test('inquiryFromRequest maps SDK labels to option ids', () => {
  assert.deepEqual(
    inquiryFromRequest({
      requestId: 'rq1',
      questions: [{
        id: 'direction',
        question: '接下来怎么走？',
        header: '方向',
        options: [{ label: '继续', description: '按原方案' }, { label: '换一条' }],
      }],
    }),
    {
      requestId: 'rq1',
      questions: [{
        id: 'direction',
        prompt: '接下来怎么走？',
        header: '方向',
        options: [
          { id: '继续', label: '继续', hint: '按原方案' },
          { id: '换一条', label: '换一条' },
        ],
      }],
    },
  )
})

test('waitForInquiryAnswer returns answers matching the requestId', async () => {
  const reads = [
    { status: 'running', progress: { kind: 'inquiry', inquiry: { requestId: 'rq1', questions: [] } } },
    { status: 'running', progress: { kind: 'inquiry-answered', inquiry: { requestId: 'rq1', questions: [] }, answer: { requestId: 'rq1', answers: [{ id: 'direction', selected: ['继续'] }] } } },
  ]
  let i = 0
  const result = await waitForInquiryAnswer({
    requestId: 'rq1',
    read: async () => reads[Math.min(i++, reads.length - 1)],
    signal: new AbortController().signal,
    sleep: async () => undefined,
  })
  assert.deepEqual(result, { answers: [{ id: 'direction', selected: ['继续'] }] })
})

test('waitForInquiryAnswer treats killed tasks and skip as cancelled', async () => {
  const killed = await waitForInquiryAnswer({
    requestId: 'rq1',
    read: async () => ({ status: 'killed' }),
    signal: new AbortController().signal,
    sleep: async () => undefined,
  })
  assert.deepEqual(killed, { cancelled: true })

  const skipped = await waitForInquiryAnswer({
    requestId: 'rq1',
    read: async () => ({
      status: 'running',
      progress: { kind: 'inquiry-answered', inquiry: { requestId: 'rq1', questions: [] }, answer: { requestId: 'rq1', cancelled: true } },
    }),
    signal: new AbortController().signal,
    sleep: async () => undefined,
  })
  assert.deepEqual(skipped, { cancelled: true })
})
