import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PgStore } from '../store/pg.store.js'
import { FavoritesService } from './favorites.service.js'

test('memory favorites add/list/remove and counts', async () => {
  const svc = new FavoritesService(new PgStore(undefined))
  assert.deepEqual(await svc.list('u-1'), [])
  assert.deepEqual(await svc.add('u-1', 'picture-book'), ['picture-book'])
  await svc.add('u-1', 'cs-scripts')
  await svc.add('u-2', 'picture-book')
  const counts = await svc.counts()
  assert.equal(counts['picture-book'], 2)
  assert.equal(counts['cs-scripts'], 1)
  const left = await svc.remove('u-1', 'picture-book')
  assert.deepEqual(left.sort(), ['cs-scripts'])
  assert.equal((await svc.counts())['picture-book'], 1)
})
