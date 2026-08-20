import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decrypt, encrypt } from './crypto.js'

const MASTER = 'test-master-key-not-for-prod'

test('encrypt then decrypt returns the original plaintext', () => {
  const { nonce, ciphertext } = encrypt(MASTER, 'sk-live-secret')
  assert.equal(decrypt(MASTER, nonce, ciphertext), 'sk-live-secret')
})

test('each encrypt uses a fresh nonce so ciphertexts differ', () => {
  const a = encrypt(MASTER, 'same-value')
  const b = encrypt(MASTER, 'same-value')
  assert.notEqual(a.nonce.toString('hex'), b.nonce.toString('hex'))
  assert.notEqual(a.ciphertext.toString('hex'), b.ciphertext.toString('hex'))
})

test('wrong master key fails to decrypt', () => {
  const { nonce, ciphertext } = encrypt(MASTER, 'sk-live-secret')
  assert.throws(() => decrypt('other-master', nonce, ciphertext))
})

test('tampered ciphertext fails to decrypt', () => {
  const { nonce, ciphertext } = encrypt(MASTER, 'sk-live-secret')
  ciphertext[0] ^= 0xff
  assert.throws(() => decrypt(MASTER, nonce, ciphertext))
})
