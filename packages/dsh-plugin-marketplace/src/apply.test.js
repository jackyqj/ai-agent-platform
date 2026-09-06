import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runSync } from './apply.js'
import { apply, handleBieneCommand } from './index.js'

function memApi(routes) {
  return async (_cfg, path) => {
    const hit = routes[path]
    if (!hit) throw new Error(`unexpected ${path}`)
    return hit
  }
}

test('runSync writes SKILL.md and skips untracked local files unless --force', async () => {
  const home = mkdtempSync(join(tmpdir(), 'biene-'))
  mkdirSync(join(home, 'skills', 'leave-faq'), { recursive: true })
  writeFileSync(join(home, 'skills', 'leave-faq', 'SKILL.md'), '---\nname: leftover\n---\nold\n')

  const request = memApi({
    '/plugin/skills': { skills: [{ id: 's1', slug: 'leave-faq' }] },
    '/plugin/skills/s1': { version: '0.2.0', markdown: '---\nname: leave-faq\nmetadata: {"skill_id":"s1","version":"0.2.0"}\n---\nbody\n' },
    '/plugin/agents': { agents: [] },
  })
  const skipped = await runSync({ cfg: { serverUrl: 'http://x/api', token: 't' }, dshHome: home, force: false, request })
  assert.ok(skipped.some((l) => l.includes('跳过 leave-faq')))
  assert.equal(readFileSync(join(home, 'skills', 'leave-faq', 'SKILL.md'), 'utf8').includes('old'), true)

  const written = await runSync({ cfg: { serverUrl: 'http://x/api', token: 't' }, dshHome: home, force: true, request })
  assert.ok(written.some((l) => l.includes('更新 leave-faq@0.2.0') || l.includes('应用 leave-faq@0.2.0')))
  assert.match(readFileSync(join(home, 'skills', 'leave-faq', 'SKILL.md'), 'utf8'), /skill_id/)
})

test('runSync writes a new skill and agent pack', async () => {
  const home = mkdtempSync(join(tmpdir(), 'biene-'))
  const request = memApi({
    '/plugin/skills': { skills: [{ id: 's1', slug: 'leave-faq' }] },
    '/plugin/skills/s1': { version: '0.1.0', markdown: '---\nname: leave-faq\nmetadata: {"skill_id":"s1","version":"0.1.0"}\n---\nfaq\n' },
    '/plugin/agents': { agents: [{ id: 'assistant' }] },
    '/plugin/agents/assistant': { version: 3, files: { 'preset.yml': 'name: a\n', 'skills/leave-faq/SKILL.md': 'snap\n' } },
  })
  const lines = await runSync({ cfg: { serverUrl: 'http://x/api', token: 't' }, dshHome: home, force: false, request })
  assert.ok(lines.some((l) => l.includes('应用 leave-faq@0.1.0')))
  assert.ok(lines.some((l) => l.includes('应用 agent assistant v3')))
  assert.match(readFileSync(join(home, 'skills', 'leave-faq', 'SKILL.md'), 'utf8'), /faq/)
  assert.equal(readFileSync(join(home, '.agent-presets', 'assistant', 'preset.yml'), 'utf8'), 'name: a\n')
})

test('runSync skips a local untracked agent preset unless --force', async () => {
  const home = mkdtempSync(join(tmpdir(), 'biene-'))
  mkdirSync(join(home, '.agent-presets', 'assistant'), { recursive: true })
  writeFileSync(join(home, '.agent-presets', 'assistant', 'preset.yml'), 'name: local\n')
  const request = memApi({
    '/plugin/skills': { skills: [] },
    '/plugin/agents': { agents: [{ id: 'assistant' }] },
    '/plugin/agents/assistant': { version: 1, files: { 'preset.yml': 'name: remote\n' } },
  })
  const skipped = await runSync({ cfg: { serverUrl: 'http://x/api', token: 't' }, dshHome: home, request })
  assert.ok(skipped.some((l) => l.includes('跳过 agent assistant')))
  assert.equal(readFileSync(join(home, '.agent-presets', 'assistant', 'preset.yml'), 'utf8'), 'name: local\n')

  const forced = await runSync({ cfg: { serverUrl: 'http://x/api', token: 't' }, dshHome: home, force: true, request })
  assert.ok(forced.some((l) => l.includes('agent assistant')))
  assert.equal(readFileSync(join(home, '.agent-presets', 'assistant', 'preset.yml'), 'utf8'), 'name: remote\n')
})

test('runSync --skill skips agents', async () => {
  const home = mkdtempSync(join(tmpdir(), 'biene-'))
  const request = memApi({
    '/plugin/skills': { skills: [{ id: 's1', slug: 'leave-faq' }] },
    '/plugin/skills/s1': { version: '0.1.0', markdown: '---\nname: leave-faq\nmetadata: {"skill_id":"s1","version":"0.1.0"}\n---\nfaq\n' },
    '/plugin/agents': { agents: [{ id: 'assistant' }] },
  })
  const lines = await runSync({ cfg: { serverUrl: 'http://x/api', token: 't' }, dshHome: home, onlySkill: 'leave-faq', request })
  assert.ok(lines.some((l) => l.includes('leave-faq')))
  assert.ok(!lines.some((l) => l.includes('agent')))
})
test('handleBieneCommand refuses unsigned sessions', async () => {
  const r = await handleBieneCommand('sync', { loadConfig: async () => undefined })
  assert.equal(r.kind, 'error')
  assert.match(r.text, /未登录/)
})

test('handleBieneCommand help does not hit the network', async () => {
  const r = await handleBieneCommand('help')
  assert.equal(r.kind, 'success')
  assert.match(r.text, /dsh-biene login/)
})

test('apply registers /biene without requiring a webServer', () => {
  const names = []
  const injects = []
  apply({
    commands: { register: (def) => { names.push(def.name) } },
    inject: (deps) => { injects.push(deps) },
  })
  assert.deepEqual(names, ['biene'])
  assert.deepEqual(injects, [['webServer']])
})
