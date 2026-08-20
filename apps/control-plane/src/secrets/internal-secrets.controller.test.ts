import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HttpException, HttpStatus } from '@nestjs/common'
import { AuditStore } from '../common/audit.store.js'
import { PgStore } from '../store/pg.store.js'
import { InternalSecretsController } from './internal-secrets.controller.js'
import { CredentialVault } from './vault.js'
import { SecretsService } from './secrets.service.js'

function makeCtrl() {
  const vault = new CredentialVault(null, 'master')
  const audit = new AuditStore(new PgStore(undefined))
  const secrets = new SecretsService(vault, {}, audit)
  return { secrets, audit, ctrl: new InternalSecretsController(secrets) }
}

test('internal resolve returns the value for a configured ref', async () => {
  const { secrets, ctrl } = makeCtrl()
  await secrets.set('DEEPSEEK_API_KEY', 'sk-live', 'u-admin')
  const out = await ctrl.resolve({ service: { keyId: 'k1', name: 'inst', scopes: ['secrets:resolve'] } }, 'DEEPSEEK_API_KEY')
  assert.deepEqual(out, { value: 'sk-live', source: 'vault' })
})

test('internal resolve 404s when unconfigured', async () => {
  const { ctrl } = makeCtrl()
  await assert.rejects(
    () => ctrl.resolve({ service: { keyId: 'k1', name: 'inst', scopes: ['secrets:resolve'] } }, 'MISSING'),
    (e: unknown) => e instanceof HttpException && e.getStatus() === HttpStatus.NOT_FOUND,
  )
})

test('internal resolve audit payload never includes plaintext', async () => {
  const { secrets, audit, ctrl } = makeCtrl()
  await secrets.set('DEEPSEEK_API_KEY', 'sk-live', 'u-admin')
  await ctrl.resolve({ service: { keyId: 'k1', name: 'inst', scopes: ['secrets:resolve'] } }, 'DEEPSEEK_API_KEY')
  const events = await audit.query({ eventType: 'secrets.resolve', limit: 10 })
  assert.equal(events.length, 1)
  assert.ok(!JSON.stringify(events[0]).includes('sk-live'))
  assert.equal(events[0]?.userId, 'k1')
})
