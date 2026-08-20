import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeModelConfig } from './models.js'

test('describeModelConfig surfaces default model and private vs cloud routes', () => {
  const cfg = describeModelConfig(
    {
      DS_API_MODEL: 'deepseek-v4-flash',
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
      VLLM_BASE_URL: 'http://127.0.0.1:8000/v1',
      VLLM_MODEL: 'qwen-72b',
    },
    [
      { id: 'assistant', name: '通用助手', modelRoute: { provider: 'deepseek-official', model: 'deepseek-v4-flash', pinned: false } },
      { id: 'report-builder', name: '报表', modelRoute: { provider: 'gateway', model: 'private/qwen-72b', pinned: true } },
    ],
  )
  assert.equal(cfg.defaultModel, 'deepseek-v4-flash')
  assert.equal(cfg.gateway.deployed, false)
  assert.equal(cfg.gateway.cloudBaseUrl, 'https://api.deepseek.com')
  assert.equal(cfg.gateway.privateBaseUrl, 'http://127.0.0.1:8000/v1')
  assert.equal(cfg.agents[0]?.route, 'cloud')
  assert.equal(cfg.agents[1]?.route, 'private')
})
