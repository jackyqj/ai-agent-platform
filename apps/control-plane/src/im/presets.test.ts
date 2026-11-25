import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSensitive, parseSwitchCommand, buildHelpText } from './presets.js'

test('isSensitive 硬性动词拒绝', () => {
  assert.equal(isSensitive('删除所有记录'), true)
  assert.equal(isSensitive('批准这笔报销'), true)
})

test('isSensitive 咨询语境放行付款', () => {
  assert.equal(isSensitive('付款流程是什么'), false)
  assert.equal(isSensitive('帮我付款给供应商'), true)
})

test('parseSwitchCommand', () => {
  assert.equal(parseSwitchCommand('切换 hr-assistant'), 'hr-assistant')
  assert.equal(parseSwitchCommand('切换  人事助手'), '人事助手')
  assert.equal(parseSwitchCommand('切换'), undefined)
  assert.equal(parseSwitchCommand('请切换一下'), undefined)
})

test('buildHelpText 空列表', () => {
  assert.match(buildHelpText([]), /没有已开通/)
})
