import type pg from 'pg'
import { decrypt, encrypt } from './crypto.js'

const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export interface SecretMeta {
  ref: string
  updatedAt: string
  updatedBy: string | null
}

/**
 * Encrypted credential store (D20). Values never leave as plaintext except via {@link get}.
 * When `pool` is null, an in-memory map is used (local smoke without PG).
 */
export class CredentialVault {
  private memory = new Map<string, { nonce: Buffer; ciphertext: Buffer; updatedAt: string; updatedBy: string | null }>()

  constructor(
    private readonly pool: pg.Pool | null,
    private readonly master: string,
  ) {
    if (!master) throw new Error('credential vault: master key is empty')
  }

  async get(ref: string): Promise<string | undefined> {
    assertRef(ref)
    if (!this.pool) {
      const row = this.memory.get(ref)
      return row ? decrypt(this.master, row.nonce, row.ciphertext) : undefined
    }
    const res = await this.pool.query<{ nonce: Buffer; ciphertext: Buffer }>(
      'SELECT nonce, ciphertext FROM credential_secrets WHERE ref = $1',
      [ref],
    )
    const row = res.rows[0]
    if (!row) return undefined
    return decrypt(this.master, row.nonce, row.ciphertext)
  }

  async set(ref: string, value: string, updatedBy?: string): Promise<void> {
    assertRef(ref)
    if (value.length === 0) throw new Error('credential vault: refuse to store an empty value; use unset')
    const { nonce, ciphertext } = encrypt(this.master, value)
    const by = updatedBy ?? null
    if (!this.pool) {
      this.memory.set(ref, { nonce, ciphertext, updatedAt: new Date().toISOString(), updatedBy: by })
      return
    }
    await this.pool.query(
      `INSERT INTO credential_secrets (ref, nonce, ciphertext, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (ref) DO UPDATE SET
         nonce = excluded.nonce, ciphertext = excluded.ciphertext,
         updated_at = now(), updated_by = excluded.updated_by`,
      [ref, nonce, ciphertext, by],
    )
  }

  async unset(ref: string): Promise<boolean> {
    assertRef(ref)
    if (!this.pool) {
      return this.memory.delete(ref)
    }
    const res = await this.pool.query('DELETE FROM credential_secrets WHERE ref = $1', [ref])
    return (res.rowCount ?? 0) > 0
  }

  async list(): Promise<SecretMeta[]> {
    if (!this.pool) {
      return [...this.memory.entries()].map(([ref, row]) => ({
        ref,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      }))
    }
    const res = await this.pool.query<{ ref: string; updatedAt: string; updatedBy: string | null }>(
      `SELECT ref, updated_at AS "updatedAt", updated_by AS "updatedBy"
       FROM credential_secrets ORDER BY ref`,
    )
    return res.rows
  }
}

function assertRef(ref: string): void {
  if (!REF_PATTERN.test(ref)) {
    throw new TypeError(`credential ref "${ref}" must match ${String(REF_PATTERN)}`)
  }
}
