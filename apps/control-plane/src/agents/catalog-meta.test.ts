import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PgStore } from '../store/pg.store.js'
import { AuditStore } from '../common/audit.store.js'
import { DEFAULT_CATALOG } from './catalog.js'
import { AgentComposer } from './composer.js'
import { MemoryPresetFileStore } from './preset-file-store.js'
import { AgentsService } from './agents.service.js'
import { FavoritesService } from './favorites.service.js'

function makeService() {
  const pg = new PgStore(undefined)
  return new AgentsService(
    pg,
    new AgentComposer(DEFAULT_CATALOG),
    new AuditStore(pg),
    new MemoryPresetFileStore(),
    undefined,
    new FavoritesService(pg),
  )
}

test('employee catalog includes Xiaobien first-wave agents with scenes', async () => {
  const svc = makeService()
  const listed = await svc.listFor('employee', '教研')
  const byId = Object.fromEntries(listed.map((a) => [a.id, a]))
  assert.ok(byId['picture-book'])
  assert.equal(byId['picture-book']!.scene, 'content')
  assert.equal(byId['cs-scripts']!.scene, 'cs')
  assert.equal(byId['community-copy']!.scene, 'community')
  assert.equal(byId['content-qa']!.scene, 'content')
  assert.equal(byId['content-qa']!.knowledge, true)
  assert.equal(byId['hr-assistant']!.knowledge, true)
  assert.equal(byId['assistant']!.scene, 'general')
  assert.equal(byId['report-builder'], undefined, '报表助手对员工不可见')
})

test('developer catalog includes report-builder in data scene', async () => {
  const svc = makeService()
  const listed = await svc.listFor('developer', '研发')
  assert.ok(listed.some((a) => a.id === 'report-builder' && a.scene === 'data'))
})
