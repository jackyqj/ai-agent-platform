import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'os'
import { test } from 'node:test'
import { AuditStore } from '../common/audit.store.js'
import { can } from '../common/permissions.js'
import { RolesService } from '../common/roles.service.js'
import { PgStore } from '../store/pg.store.js'
import { KbService } from './kb.service.js'
import { documentVisible } from './kb.types.js'

function kbService() {
  return new KbService(new AuditStore(new PgStore(undefined)))
}

test('kb.manage is admin-only for preset roles', () => {
  assert.equal(can('admin', 'kb.manage'), true)
  assert.equal(can('employee', 'kb.manage'), false)
})

test('custom role can grant kb.manage', async () => {
  const roles = new RolesService({
    pool: {},
    listRoleDefinitions: async () => [{ name: 'kb-editor', permissions: ['kb.manage'], dshPreset: 'workspace-write' }],
  } as never)
  await roles.onModuleInit()
  assert.equal(roles.can('kb-editor', 'kb.manage'), true)
  assert.deepEqual(roles.permissionsOf('kb-editor'), ['kb.manage'])
})

test('upload list patch delete document', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kb-test-'))
  const docs = join(root, 'docs')
  const index = join(root, 'data/index.json')
  process.env.KB_DOCS_ROOT = docs
  process.env.KB_INDEX_PATH = index
  await mkdir(join(root, 'data'), { recursive: true })
  await writeFile(index, JSON.stringify({ model: 'test', chunks: [] }))

  const kb = kbService()
  const content = Buffer.from('# hello\n\nworld content here').toString('base64')
  const doc = await kb.uploadDocument('test.md', content, { classification: 'public', departments: ['*'], roles: [] })
  assert.equal(doc.name, 'test.md')
  assert.equal(doc.visibility.classification, 'public')

  const list = await kb.listDocuments()
  assert.equal(list.length, 1)
  assert.equal(list[0].chunkCount, 0)

  const vis = await kb.patchVisibility('test.md', { classification: 'internal', departments: ['HR'], roles: [] })
  assert.equal(vis.classification, 'internal')
  assert.deepEqual(vis.departments, ['HR'])

  await kb.deleteDocument('test.md')
  assert.equal((await kb.listDocuments()).length, 0)
})

test('documentVisible matches mcp-kb: public open, dept/role gated otherwise', () => {
  const internalHr = { classification: 'internal' as const, departments: ['HR'], roles: [] }
  const confidential = { classification: 'confidential' as const, departments: ['sales'], roles: ['sales-admin'] }
  assert.equal(documentVisible({ classification: 'public', departments: ['*'], roles: [] }, undefined), true)
  assert.equal(documentVisible(internalHr, { departments: ['HR'] }), true)
  assert.equal(documentVisible(internalHr, { departments: ['sales'] }), false)
  assert.equal(documentVisible(confidential, { departments: ['sales'], roles: ['employee'] }), false)
  assert.equal(documentVisible(confidential, { departments: ['sales'], roles: ['sales-admin'] }), true)
})

test('rejects invalid filename', async () => {
  const kb = kbService()
  await assert.rejects(() => kb.uploadDocument('../evil.md', Buffer.from('x').toString('base64')), /invalid filename/)
})
