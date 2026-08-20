import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CredentialVault } from './vault.js'

test('memory vault round-trips a secret and lists metadata without the value', async () => {
  const vault = new CredentialVault(null, 'master')
  await vault.set('DEEPSEEK_API_KEY', 'sk-test', 'u-admin')
  assert.equal(await vault.get('DEEPSEEK_API_KEY'), 'sk-test')
  const listed = await vault.list()
  assert.equal(listed.length, 1)
  assert.equal(listed[0].ref, 'DEEPSEEK_API_KEY')
  assert.equal(listed[0].updatedBy, 'u-admin')
  assert.ok(!JSON.stringify(listed).includes('sk-test'))
})

test('unset of a missing ref is a no-op; empty values are rejected', async () => {
  const vault = new CredentialVault(null, 'master')
  assert.equal(await vault.unset('MISSING_REF'), false)
  await assert.rejects(() => vault.set('DEEPSEEK_API_KEY', ''), /empty/)
  await assert.rejects(() => vault.get('not-a-posix-id'), /credential ref/)
})

test('set overwrites the previous value', async () => {
  const vault = new CredentialVault(null, 'master')
  await vault.set('DEEPSEEK_API_KEY', 'old')
  await vault.set('DEEPSEEK_API_KEY', 'new')
  assert.equal(await vault.get('DEEPSEEK_API_KEY'), 'new')
  await vault.unset('DEEPSEEK_API_KEY')
  assert.equal(await vault.get('DEEPSEEK_API_KEY'), undefined)
})
