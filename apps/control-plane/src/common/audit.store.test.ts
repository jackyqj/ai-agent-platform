import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AuditStore } from './audit.store.js'
import { PgStore } from '../store/pg.store.js'

test('query can filter by sessionId', async () => {
  const audit = new AuditStore(new PgStore(undefined))
  await audit.append({ userId: 'u-hr-1', sessionId: 's-1', eventType: 'session.create', payload: {} })
  await audit.append({ userId: 'u-hr-1', sessionId: 's-2', eventType: 'session.create', payload: {} })
  const rows = await audit.query({ sessionId: 's-1', limit: 50 })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.sessionId, 's-1')
})
