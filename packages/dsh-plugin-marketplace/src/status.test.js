import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MarketRequestError } from './auth.js'
import { buildStatus } from './status.js'

function memApi(routes) {
  const hits = []
  const request = async (_cfg, path) => {
    hits.push(path)
    const hit = routes[path]
    if (hit instanceof Error) throw hit
    if (!hit) throw new Error(`unexpected ${path}`)
    return hit
  }
  return { request, hits }
}

function homeWith(files) {
  const home = mkdtempSync(join(tmpdir(), 'biene-status-'))
  for (const [rel, body] of Object.entries(files)) {
    const dest = join(home, rel)
    mkdirSync(join(dest, '..'), { recursive: true })
    writeFileSync(dest, body, 'utf8')
  }
  return home
}

test('buildStatus does not call the control plane when unsigned', async () => {
  const { request, hits } = memApi({})
  const snap = await buildStatus({
    dshHome: homeWith({}),
    loadConfig: async () => undefined,
    request,
  })
  assert.deepEqual(hits, [])
  assert.equal(snap.loggedIn, false)
  assert.equal(snap.error.code, 'unauthenticated')
  assert.deepEqual(snap.skills, [])
  assert.deepEqual(snap.agents, [])
})

test('buildStatus classifies skills and agents against local files', async () => {
  const home = homeWith({
    'skills/current/SKILL.md': '---\nskill_id: s-cur\nversion: 1.0.0\n---\n',
    'skills/stale/SKILL.md': '---\nskill_id: s-old\nversion: 1.0.0\n---\n',
    'skills/local-only/SKILL.md': '---\nname: leftover\n---\n',
    '.agent-presets/assistant/.bienen-origin.json': JSON.stringify({ source: 'marketplace', id: 'assistant', version: 2 }),
    '.agent-presets/assistant/preset.yml': 'name: a\n',
    '.agent-presets/homemade/preset.yml': 'name: mine\n',
  })
  const { request } = memApi({
    '/plugin/skills': {
      skills: [
        { id: 's-new', slug: 'fresh', version: '0.1.0', title: 'Fresh' },
        { id: 's-cur', slug: 'current', version: '1.0.0', title: 'Current' },
        { id: 's-old', slug: 'stale', version: '1.1.0', title: 'Stale' },
        { id: 's-loc', slug: 'local-only', version: '2.0.0', title: 'Clash' },
      ],
    },
    '/plugin/agents': {
      agents: [
        { id: 'assistant', name: '助手', version: 2 },
        { id: 'homemade', name: '土制', version: 1 },
        { id: 'missing-bot', name: '新来的', version: 1 },
      ],
    },
  })
  const snap = await buildStatus({
    dshHome: home,
    loadConfig: async () => ({ serverUrl: 'http://cp/api', token: 't' }),
    request,
  })
  assert.equal(snap.loggedIn, true)
  assert.equal(snap.serverUrl, 'http://cp/api')
  assert.equal(snap.error, undefined)
  const bySlug = Object.fromEntries(snap.skills.map((s) => [s.slug, s]))
  assert.equal(bySlug.fresh.state, 'missing')
  assert.equal(bySlug.fresh.localVersion, null)
  assert.equal(bySlug.fresh.remoteVersion, '0.1.0')
  assert.equal(bySlug.current.state, 'current')
  assert.equal(bySlug.stale.state, 'update')
  assert.equal(bySlug['local-only'].state, 'conflict')
  const byId = Object.fromEntries(snap.agents.map((a) => [a.id, a]))
  assert.equal(byId.assistant.state, 'current')
  assert.equal(byId.assistant.title, '助手')
  assert.equal(byId.homemade.state, 'conflict')
  assert.equal(byId['missing-bot'].state, 'missing')
})

test('buildStatus maps a 401 to unauthorized without catalog rows', async () => {
  const { request } = memApi({
    '/plugin/skills': new MarketRequestError('unauthorized', 'JWT 已失效，请重新 dsh-biene login'),
  })
  const snap = await buildStatus({
    dshHome: homeWith({}),
    loadConfig: async () => ({ serverUrl: 'http://cp/api', token: 'dead' }),
    request,
  })
  assert.equal(snap.loggedIn, true)
  assert.equal(snap.error.code, 'unauthorized')
  assert.deepEqual(snap.skills, [])
  assert.deepEqual(snap.agents, [])
})

test('buildStatus maps a timeout to unreachable', async () => {
  const { request } = memApi({
    '/plugin/skills': new MarketRequestError('unreachable', '控制面超时'),
  })
  const snap = await buildStatus({
    dshHome: homeWith({}),
    loadConfig: async () => ({ serverUrl: 'http://cp/api', token: 't' }),
    request,
  })
  assert.equal(snap.error.code, 'unreachable')
})
