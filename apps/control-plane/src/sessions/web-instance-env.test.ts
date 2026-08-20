import assert from 'node:assert/strict'
import { test } from 'node:test'
import { webInstanceEnv } from './web-instance-env.js'

test('interactive instance env does not carry the vault master key or JWT secret', () => {
  const env = webInstanceEnv('workspace-write', {
    DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
    DATABASE_URL: 'postgres://cp',
    SECRETS_MASTER_KEY: 'master-must-not-leak',
    CP_JWT_SECRET: 'jwt-must-not-leak',
    CP_SECRETS_TOKEN: 'cp_instance_token',
    CP_PORT: '4000',
  })
  assert.equal(env.SECRETS_MASTER_KEY, undefined)
  assert.equal(env.CP_JWT_SECRET, undefined)
  assert.equal(env.DEEPSEEK_API_KEY, undefined)
  assert.equal(env.CP_SECRETS_TOKEN, 'cp_instance_token')
  assert.equal(env.CP_SECRETS_URL, 'http://127.0.0.1:4000/api/internal/secrets')
  assert.equal(env.DSH_PERMISSION_MODE, 'workspace-write')
})

test('CP_SECRETS_URL override wins so containers can reach the host', () => {
  const env = webInstanceEnv('read-only', {
    CP_SECRETS_URL: 'http://host.containers.internal:4000/api/internal/secrets',
    CP_SECRETS_TOKEN: 'tok',
  })
  assert.equal(env.CP_SECRETS_URL, 'http://host.containers.internal:4000/api/internal/secrets')
})
