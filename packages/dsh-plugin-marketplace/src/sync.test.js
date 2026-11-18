import assert from 'node:assert/strict'
import { test } from 'node:test'
import { catalogState, parseSkillMeta, planSkillApply } from './sync.js'

test('missing local file is a write', () => {
  assert.deepEqual(planSkillApply({ exists: false }, { id: 's1', version: '0.1.0' }), { action: 'write' })
})

test('server-tagged local file overwrites when skill_id matches', () => {
  const plan = planSkillApply(
    { exists: true, meta: { skill_id: 's1', version: '0.1.0' } },
    { id: 's1', version: '0.2.0' },
  )
  assert.equal(plan.action, 'overwrite')
  if (plan.action === 'overwrite') assert.equal(plan.to, '0.2.0')
})

test('local file without server metadata is a conflict', () => {
  const plan = planSkillApply({ exists: true, meta: {} }, { id: 's1', version: '0.1.0' })
  assert.deepEqual(plan, { action: 'conflict', reason: 'local-untracked' })
})

test('catalogState maps apply plans onto panel states', () => {
  assert.equal(catalogState({ exists: false }, { id: 's1', version: '0.1.0' }), 'missing')
  assert.equal(
    catalogState({ exists: true, meta: { skill_id: 's1', version: '0.1.0' } }, { id: 's1', version: '0.1.0' }),
    'current',
  )
  assert.equal(
    catalogState({ exists: true, meta: { skill_id: 's1', version: '0.1.0' } }, { id: 's1', version: '0.2.0' }),
    'update',
  )
  assert.equal(catalogState({ exists: true, meta: {} }, { id: 's1', version: '0.1.0' }), 'conflict')
  assert.equal(
    catalogState({ exists: true, meta: { skill_id: 'other', version: '0.1.0' } }, { id: 's1', version: '0.1.0' }),
    'conflict',
  )
})

test('parseSkillMeta reads skill_id and version from frontmatter', () => {
  assert.deepEqual(parseSkillMeta('---\nname: x\nskill_id: abc\nversion: 1.2.3\n---\nbody'), {
    skill_id: 'abc',
    version: '1.2.3',
  })
  const nested = parseSkillMeta('---\nname: leave-faq\nmetadata: {"skill_id":"abc","version":"1.2.3"}\n---\nbody')
  assert.equal(nested.skill_id, 'abc')
  assert.equal(nested.version, '1.2.3')
})
