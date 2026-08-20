import assert from 'node:assert/strict'
import { test } from 'node:test'
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
