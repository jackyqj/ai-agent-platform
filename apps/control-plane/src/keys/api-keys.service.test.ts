import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AuditStore } from '../common/audit.store.js'
import { PgStore } from '../store/pg.store.js'
import { ApiKeysService } from './api-keys.service.js'

function makeKeys() {
  const pg = new PgStore(undefined)
  return new ApiKeysService(pg, new AuditStore(pg))
}

test('ensureWithPlaintext registers a known token once and validate accepts it', async () => {
  const keys = makeKeys()
  const first = await keys.ensureWithPlaintext('dsh-instance-resolve', ['secrets:resolve'], 'cp_dev_secrets_resolve', 'bootstrap')
  const second = await keys.ensureWithPlaintext('dsh-instance-resolve', ['secrets:resolve'], 'cp_dev_secrets_resolve', 'bootstrap')
  assert.equal(first.created, true)
  assert.equal(second.created, false)
  const principal = await keys.validate('cp_dev_secrets_resolve', 'secrets:resolve')
  assert.equal(principal.name, 'dsh-instance-resolve')
  assert.ok(principal.scopes.includes('secrets:resolve'))
})
