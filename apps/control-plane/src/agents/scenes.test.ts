import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AGENT_SCENES, isAgentSceneId, sceneLabel } from './scenes.js'

test('scene catalog covers the seven employee filters', () => {
  assert.deepEqual(AGENT_SCENES.map((s) => s.id), ['general', 'hr', 'rd', 'data', 'content', 'cs', 'community'])
  assert.equal(sceneLabel('cs'), '客服')
  assert.equal(isAgentSceneId('content'), true)
  assert.equal(isAgentSceneId('unknown'), false)
})
