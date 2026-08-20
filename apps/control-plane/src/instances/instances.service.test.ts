import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PgStore } from '../store/pg.store.js'
import { InstancesService } from './instances.service.js'

test('stopForUser reclaims only that user live instances', async () => {
  const instances = new InstancesService(new PgStore(undefined))
  await instances.getOrCreateWebInstance({ userId: 'u-hr-1', env: {} })
  await instances.getOrCreateWebInstance({ userId: 'u-dev-1', env: {} })
  const stopped = await instances.stopForUser('u-hr-1')
  assert.equal(stopped.length, 1)
  const left = await instances.list()
  assert.equal(left.length, 1)
  assert.equal(left[0]?.userId, 'u-dev-1')
})
