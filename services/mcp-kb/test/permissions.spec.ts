import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { canAccess, resolveVisibility, type DocManifest, type UserContext } from '../src/permissions.js'
import { rerank, type Chunk } from '../src/vector-index.js'

const manifest: DocManifest = {
  'public.md': { classification: 'public', departments: ['*'], roles: [] },
  'internal.md': { classification: 'internal', departments: ['*'], roles: [] },
  'sales.md': { classification: 'internal', departments: ['sales'], roles: [] },
  'secret.md': { classification: 'confidential', departments: ['sales'], roles: ['sales-admin'] },
}

describe('permissions', () => {
  it('public docs accessible without user context', () => {
    const vis = resolveVisibility(manifest, 'public.md')
    assert.equal(canAccess(vis, undefined), true)
  })

  it('internal docs require user context', () => {
    const vis = resolveVisibility(manifest, 'internal.md')
    assert.equal(canAccess(vis, undefined), false)
    assert.equal(canAccess(vis, { departments: ['HR'] }), true)
  })

  it('department-restricted docs filter by department', () => {
    const vis = resolveVisibility(manifest, 'sales.md')
    assert.equal(canAccess(vis, { departments: ['HR'] }), false)
    assert.equal(canAccess(vis, { departments: ['sales'] }), true)
  })

  it('confidential docs require matching role', () => {
    const vis = resolveVisibility(manifest, 'secret.md')
    const salesUser: UserContext = { departments: ['sales'], roles: ['employee'] }
    const adminUser: UserContext = { departments: ['sales'], roles: ['sales-admin'] }
    assert.equal(canAccess(vis, salesUser), false)
    assert.equal(canAccess(vis, adminUser), true)
  })

  it('defaults to internal/all when doc not in manifest', () => {
    const vis = resolveVisibility(manifest, 'unknown.md')
    assert.equal(vis.classification, 'internal')
    assert.equal(canAccess(vis, undefined), false)
    assert.equal(canAccess(vis, { departments: ['HR'] }), true)
  })
})

describe('rerank', () => {
  const mkChunk = (text: string, heading: string): Chunk => ({
    id: 'test#0',
    source: 'test.md',
    heading,
    text,
    vector: [],
    visibility: { classification: 'public', departments: ['*'], roles: [] },
  })

  it('boosts chunks with keyword overlap', () => {
    const candidates = [
      { chunk: mkChunk('报销上限 800 元', '报销'), score: 0.6 },
      { chunk: mkChunk('请假流程说明', '请假'), score: 0.65 },
    ]
    const hits = rerank(candidates, '报销上限', 2)
    assert.equal(hits[0].chunk.heading, '报销')
  })
})
