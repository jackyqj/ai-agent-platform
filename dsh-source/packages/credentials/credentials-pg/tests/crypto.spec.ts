import { describe, expect, it } from 'vitest'
import { decrypt, encrypt } from '../src/crypto.ts'

const MASTER = 'test-master-key-not-for-prod'

describe('vault crypto', () => {
  it('round-trips plaintext', () => {
    const { nonce, ciphertext } = encrypt(MASTER, 'sk-live-secret')
    expect(decrypt(MASTER, nonce, ciphertext)).toBe('sk-live-secret')
  })

  it('uses a fresh nonce so ciphertexts differ', () => {
    const a = encrypt(MASTER, 'same-value')
    const b = encrypt(MASTER, 'same-value')
    expect(a.nonce.toString('hex')).not.toBe(b.nonce.toString('hex'))
    expect(a.ciphertext.toString('hex')).not.toBe(b.ciphertext.toString('hex'))
  })

  it('rejects an empty plaintext', () => {
    expect(() => encrypt(MASTER, '')).toThrow(/empty/)
  })

  it('rejects an empty master key', () => {
    expect(() => encrypt('', 'sk')).toThrow(/master key is empty/)
  })

  it('fails to decrypt with the wrong master', () => {
    const { nonce, ciphertext } = encrypt(MASTER, 'sk-live-secret')
    expect(() => decrypt('other-master', nonce, ciphertext)).toThrow()
  })

  it('fails to decrypt a tampered ciphertext', () => {
    const { nonce, ciphertext } = encrypt(MASTER, 'sk-live-secret')
    ciphertext[0] ^= 0xff
    expect(() => decrypt(MASTER, nonce, ciphertext)).toThrow()
  })

  it('fails to decrypt a truncated ciphertext', () => {
    const { nonce } = encrypt(MASTER, 'sk-live-secret')
    expect(() => decrypt(MASTER, nonce, Buffer.alloc(8))).toThrow(/too short/)
  })
})
