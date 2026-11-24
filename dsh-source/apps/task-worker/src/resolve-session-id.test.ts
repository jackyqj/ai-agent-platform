import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveDshSessionId } from './resolve-session-id.js'

test('reuses store session id across attempts', () => {
  assert.equal(
    resolveDshSessionId({ storeSessionId: 'sess-abc', taskId: 't1', attempt: 1 }),
    'sess-abc',
  )
  assert.equal(
    resolveDshSessionId({ storeSessionId: 'sess-abc', taskId: 't1', attempt: 3 }),
    'sess-abc',
  )
})

test('falls back to per-task attempt id when no store session', () => {
  assert.equal(
    resolveDshSessionId({ taskId: 't9', attempt: 2 }),
    'task-t9-a2',
  )
  assert.equal(
    resolveDshSessionId({ storeSessionId: '  ', taskId: 't9', attempt: 1 }),
    'task-t9-a1',
  )
})
