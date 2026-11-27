import assert from 'node:assert/strict'
import { test } from 'node:test'
import { firstNonEmpty, officialModelOf, pickRuntimeRoute } from './runtime-route.js'

test('firstNonEmpty skips blanks and takes the first real value', () => {
  assert.equal(firstNonEmpty('', '  ', undefined, 'sk-live', 'sk-other'), 'sk-live')
  assert.equal(firstNonEmpty('', '  '), '')
})

test('officialModelOf keeps a direct DeepSeek id and maps cloud aliases', () => {
  assert.equal(officialModelOf('deepseek-v4-flash', undefined), 'deepseek-v4-flash')
  assert.equal(officialModelOf('cloud/deepseek', 'deepseek-v4-flash'), 'deepseek-v4-flash')
  assert.equal(officialModelOf('cloud/deepseek', 'cloud/deepseek'), 'deepseek-v4-flash')
  assert.equal(officialModelOf('private/qwen-72b', undefined), 'deepseek-v4-flash')
})

test('uses the gateway when GATEWAY_KEY is present', () => {
  const route = pickRuntimeRoute({
    requestedModel: 'cloud/deepseek',
    gatewayKey: 'sk-lm-master',
    deepseekKey: 'sk-ds',
    officialModel: 'deepseek-v4-flash',
  })
  assert.deepEqual(route, { provider: 'gateway', model: 'cloud/deepseek', reason: 'gateway' })
})

test('falls back to official DeepSeek when the gateway key is missing', () => {
  const route = pickRuntimeRoute({
    requestedModel: 'cloud/deepseek',
    gatewayKey: '',
    deepseekKey: 'sk-ds',
    officialModel: 'deepseek-v4-flash',
  })
  assert.deepEqual(route, {
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    reason: 'gateway-fallback-official',
  })
})

test('keeps an explicit official model id', () => {
  const route = pickRuntimeRoute({
    requestedModel: 'deepseek-v4-flash',
    gatewayKey: '',
    deepseekKey: 'sk-ds',
    officialModel: 'ignored',
  })
  assert.deepEqual(route, { provider: 'deepseek-official', model: 'deepseek-v4-flash', reason: 'official' })
})

test('private models without a gateway key fail closed', () => {
  assert.throws(
    () => pickRuntimeRoute({
      requestedModel: 'private/qwen-72b',
      gatewayKey: '',
      deepseekKey: 'sk-ds',
      officialModel: 'deepseek-v4-flash',
    }),
    /private\/\* models require the LiteLLM gateway/,
  )
})

test('missing both credentials fails with a named fix', () => {
  assert.throws(
    () => pickRuntimeRoute({
      requestedModel: 'cloud/deepseek',
      gatewayKey: '',
      deepseekKey: '',
      officialModel: 'deepseek-v4-flash',
    }),
    /No model credential/,
  )
})
