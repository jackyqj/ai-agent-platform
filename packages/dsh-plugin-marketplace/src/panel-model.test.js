import assert from 'node:assert/strict'
import { test } from 'node:test'
import { badgeCount, loginCommand, rowAction, stateLabel } from './panel-model.js'

test('badgeCount is zero when every missing row has been applied', () => {
  assert.equal(badgeCount({ skills: [{ state: 'missing' }], agents: [] }), 1)
  assert.equal(badgeCount({ skills: [{ state: 'current' }], agents: [] }), 0)
})

test('loginCommand uses the saved server URL or a placeholder', () => {
  assert.equal(
    loginCommand('http://127.0.0.1:4000/api'),
    'dsh-biene login --server http://127.0.0.1:4000/api --token <JWT>',
  )
  assert.equal(
    loginCommand(undefined),
    'dsh-biene login --server <控制面URL>/api --token <JWT>',
  )
})

test('rowAction exposes apply or update only for missing and update', () => {
  assert.equal(rowAction('missing'), 'apply')
  assert.equal(rowAction('update'), 'update')
  assert.equal(rowAction('current'), null)
  assert.equal(rowAction('conflict'), null)
})

test('stateLabel is the Chinese chip copy', () => {
  assert.equal(stateLabel('missing'), '未应用')
  assert.equal(stateLabel('current'), '已应用')
  assert.equal(stateLabel('update'), '可更新')
  assert.equal(stateLabel('conflict'), '冲突')
})
