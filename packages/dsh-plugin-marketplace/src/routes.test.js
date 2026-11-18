import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMarketHandlers } from './routes.js'

function memApi(routes) {
  return async (_cfg, path) => {
    const hit = routes[path]
    if (hit instanceof Error) throw hit
    if (!hit) throw new Error(`unexpected ${path}`)
    return hit
  }
}

function homeDir() {
  return mkdtempSync(join(tmpdir(), 'biene-http-'))
}

function mockRes() {
  const captured = { status: 0, headers: {}, body: '' }
  const res = {
    writeHead(status, headers) {
      captured.status = status
      Object.assign(captured.headers, headers ?? {})
    },
    end(chunk) {
      captured.body = chunk ?? ''
    },
    setHeader(name, value) {
      captured.headers[name] = value
    },
  }
  return { res, captured }
}

async function invoke(handler, { method, body } = {}) {
  const { res, captured } = mockRes()
  const req = Readable.from([body ? JSON.stringify(body) : ''])
  req.method = method ?? 'GET'
  await handler(req, res)
  return { ...captured, json: captured.body ? JSON.parse(captured.body) : undefined }
}

const catalog = {
  '/plugin/skills': {
    skills: [
      { id: 's1', slug: 'leave-faq', version: '0.1.0', title: '请假' },
      { id: 's2', slug: 'local-skill', version: '1.0.0', title: '冲突' },
    ],
  },
  '/plugin/skills/s1': {
    version: '0.1.0',
    markdown: '---\nname: leave-faq\nmetadata: {"skill_id":"s1","version":"0.1.0"}\n---\nfaq\n',
  },
  '/plugin/skills/s2': {
    version: '1.0.0',
    markdown: '---\nname: local-skill\nmetadata: {"skill_id":"s2","version":"1.0.0"}\n---\nno\n',
  },
  '/plugin/agents': { agents: [] },
}

test('GET /bienen/status is 200 unsigned and does not fetch the catalog', async () => {
  let fetched = false
  const handlers = createMarketHandlers({
    dshHome: homeDir(),
    loadConfig: async () => undefined,
    request: async () => { fetched = true; return {} },
  })
  const out = await invoke(handlers.status)
  assert.equal(out.status, 200)
  assert.equal(out.json.loggedIn, false)
  assert.equal(out.json.error.code, 'unauthenticated')
  assert.equal(fetched, false)
})

test('POST /bienen/apply is 401 when unsigned', async () => {
  const handlers = createMarketHandlers({
    dshHome: homeDir(),
    loadConfig: async () => undefined,
    request: async () => { throw new Error('should not fetch') },
  })
  const out = await invoke(handlers.apply, { method: 'POST', body: {} })
  assert.equal(out.status, 401)
  assert.equal(out.json.loggedIn, false)
})

test('POST /bienen/apply writes missing skills and skips conflicts even with force in the body', async () => {
  const home = homeDir()
  mkdirSync(join(home, 'skills', 'local-skill'), { recursive: true })
  writeFileSync(join(home, 'skills', 'local-skill', 'SKILL.md'), '---\nname: leftover\n---\nold\n')
  const handlers = createMarketHandlers({
    dshHome: home,
    loadConfig: async () => ({ serverUrl: 'http://cp/api', token: 't' }),
    request: memApi(catalog),
  })
  const out = await invoke(handlers.apply, { method: 'POST', body: { force: true } })
  assert.equal(out.status, 200)
  assert.ok(out.json.applied.includes('leave-faq'))
  assert.ok(out.json.skipped.includes('local-skill'))
  assert.match(readFileSync(join(home, 'skills', 'leave-faq', 'SKILL.md'), 'utf8'), /faq/)
  assert.match(readFileSync(join(home, 'skills', 'local-skill', 'SKILL.md'), 'utf8'), /old/)
  const leave = out.json.skills.find((s) => s.slug === 'leave-faq')
  assert.equal(leave.state, 'current')
})
