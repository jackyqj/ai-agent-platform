import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AuditStore } from '../common/audit.store.js'
import { PgStore } from '../store/pg.store.js'
import { CredentialVault } from './vault.js'
import { SecretsService } from './secrets.service.js'

test('resolve prefers vault over env so rotation takes effect on the next read', async () => {
  const vault = new CredentialVault(null, 'master')
  const env: NodeJS.ProcessEnv = { DEEPSEEK_API_KEY: 'from-env' }
  const secrets = new SecretsService(vault, env)
  assert.deepEqual(await secrets.resolve('DEEPSEEK_API_KEY'), { value: 'from-env', source: 'env' })
  await secrets.set('DEEPSEEK_API_KEY', 'from-vault', 'u-admin')
  assert.deepEqual(await secrets.resolve('DEEPSEEK_API_KEY'), { value: 'from-vault', source: 'vault' })
})

test('bootstrap copies DS_API_KEY into DEEPSEEK_API_KEY once and does not overwrite', async () => {
  const vault = new CredentialVault(null, 'master')
  const env: NodeJS.ProcessEnv = { DS_API_KEY: 'sk-from-ds' }
  const secrets = new SecretsService(vault, env)
  assert.deepEqual(await secrets.bootstrap(), ['DEEPSEEK_API_KEY'])
  assert.equal((await secrets.resolve('DEEPSEEK_API_KEY'))?.value, 'sk-from-ds')
  env.DS_API_KEY = 'sk-new-env'
  assert.deepEqual(await secrets.bootstrap(), [])
  assert.equal((await secrets.resolve('DEEPSEEK_API_KEY'))?.value, 'sk-from-ds')
})

test('bootstrap copies EMBED_API_KEY once', async () => {
  const vault = new CredentialVault(null, 'master')
  const env: NodeJS.ProcessEnv = { EMBED_API_KEY: 'sk-embed' }
  const secrets = new SecretsService(vault, env)
  assert.deepEqual(await secrets.bootstrap(), ['EMBED_API_KEY'])
  assert.equal((await secrets.resolve('EMBED_API_KEY'))?.value, 'sk-embed')
})

test('describe never includes the secret value', async () => {
  const vault = new CredentialVault(null, 'master')
  const secrets = new SecretsService(vault, {})
  await secrets.set('CP_OIDC_CLIENT_SECRET', 'super-secret')
  const info = await secrets.describe('CP_OIDC_CLIENT_SECRET')
  assert.deepEqual(info, { configured: true, source: 'vault', writable: true })
  assert.ok(!JSON.stringify(info).includes('super-secret'))
})

test('resolve audits ref and source without the plaintext', async () => {
  const vault = new CredentialVault(null, 'master')
  const audit = new AuditStore(new PgStore(undefined))
  const secrets = new SecretsService(vault, {}, audit)
  await secrets.set('DEEPSEEK_API_KEY', 'sk-live', 'u-admin')
  await secrets.resolve('DEEPSEEK_API_KEY', { via: 'http', actorId: 'k-instance' })
  const events = await audit.query({ eventType: 'secrets.resolve', limit: 10 })
  assert.equal(events.length, 1)
  assert.deepEqual(events[0]?.payload, { ref: 'DEEPSEEK_API_KEY', source: 'vault', configured: true, via: 'http' })
  assert.equal(events[0]?.userId, 'k-instance')
  assert.ok(!JSON.stringify(events[0]).includes('sk-live'))
})

test('describe does not write a resolve audit event', async () => {
  const vault = new CredentialVault(null, 'master')
  const audit = new AuditStore(new PgStore(undefined))
  const secrets = new SecretsService(vault, {}, audit)
  await secrets.set('DEEPSEEK_API_KEY', 'sk-live', 'u-admin')
  await secrets.describe('DEEPSEEK_API_KEY')
  assert.equal((await audit.query({ eventType: 'secrets.resolve', limit: 10 })).length, 0)
})

test('unconfigured resolve is still audited', async () => {
  const vault = new CredentialVault(null, 'master')
  const audit = new AuditStore(new PgStore(undefined))
  const secrets = new SecretsService(vault, {}, audit)
  assert.equal(await secrets.resolve('MISSING_KEY', { via: 'http' }), undefined)
  const events = await audit.query({ eventType: 'secrets.resolve', limit: 10 })
  assert.equal(events.length, 1)
  assert.deepEqual(events[0]?.payload, { ref: 'MISSING_KEY', source: null, configured: false, via: 'http' })
})
