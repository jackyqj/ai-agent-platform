import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const NONCE_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32
const KDF_SALT = 'd20-credential-vault-v1'

/** Derive a 256-bit AES key from the process master secret. */
export function deriveKey(master: string): Buffer {
  if (!master) throw new Error('credential vault: master key is empty')
  return scryptSync(master, KDF_SALT, KEY_BYTES)
}

/**
 * Encrypt one secret. `ciphertext` is AES-GCM payload || 16-byte auth tag.
 * @param master - process master secret (never stored).
 * @param plaintext - non-empty secret value.
 */
export function encrypt(master: string, plaintext: string): { nonce: Buffer; ciphertext: Buffer } {
  if (plaintext.length === 0) throw new Error('credential vault: refuse to encrypt an empty value')
  const key = deriveKey(master)
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv(ALGO, key, nonce)
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return { nonce, ciphertext: Buffer.concat([body, tag]) }
}

/**
 * Decrypt one secret previously produced by {@link encrypt}.
 * @throws on wrong master key or tampered ciphertext.
 */
export function decrypt(master: string, nonce: Buffer, ciphertext: Buffer): string {
  if (ciphertext.length < TAG_BYTES) throw new Error('credential vault: ciphertext too short')
  const key = deriveKey(master)
  const tag = ciphertext.subarray(ciphertext.length - TAG_BYTES)
  const body = ciphertext.subarray(0, ciphertext.length - TAG_BYTES)
  const decipher = createDecipheriv(ALGO, key, nonce)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
}
