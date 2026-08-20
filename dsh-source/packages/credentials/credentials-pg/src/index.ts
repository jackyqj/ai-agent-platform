/**
 * PostgreSQL-backed credentials provider for the D20 vault (`credential_secrets`).
 * Vault wins over the process environment so an admin rotation reaches the next
 * `resolve` without restarting the runtime. Values are never cached.
 *
 * Platform-owned provider for the 09 工单. NOT an upstream contribution: repo
 * gates (doc-sync, bilingual README) are owned separately.
 *
 * @module @deepseek-ai/dsh-credentials-pg
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import pg from 'pg'
import { CredentialProvider, credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialRef, ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { decrypt, encrypt } from './crypto.ts'

export { decrypt, encrypt } from './crypto.ts'

const MEMORY_URL = 'memory:'
const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export interface Config {
  /** PostgreSQL connection string, or the literal `memory:` for in-process tests. */
  url: string
  /** Vault master secret (`SECRETS_MASTER_KEY`, local fallback `CP_JWT_SECRET`). */
  masterKey: string
}

interface StoredRow {
  nonce: Buffer
  ciphertext: Buffer
}

/** Query surface shared by a live pool and tests that inject a stub. */
export interface SecretQuery {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Array<{ nonce: Buffer; ciphertext: Buffer }> }>
}

/**
 * Plugin config: a non-empty url and master key. Defaulting happens in
 * {@link resolveSpec}, never inline.
 */
export function resolveSpec(config: Config): Config {
  if (!config.url) throw new Error('credentials-pg: url is required (postgres URL, or memory: for tests)')
  if (!config.masterKey) throw new Error('credentials-pg: master key is empty')
  return { url: config.url, masterKey: config.masterKey }
}

function assertRef(ref: string): CredentialRef {
  if (!REF_PATTERN.test(ref)) {
    throw new TypeError(`credential ref "${ref}" must match ${String(REF_PATTERN)}`)
  }
  return credentialRef(ref)
}

/**
 * Decrypt one vault row for a caller that already has a pool (worker MCP env).
 * @param query - PG query function (pool or client).
 * @param masterKey - vault master secret.
 * @param ref - credential reference.
 * @returns plaintext, or `undefined` while unconfigured.
 */
export async function lookupSecret(
  query: SecretQuery,
  masterKey: string,
  ref: string,
): Promise<string | undefined> {
  assertRef(ref)
  const res = await query.query(
    'SELECT nonce, ciphertext FROM credential_secrets WHERE ref = $1',
    [ref],
  )
  const row = res.rows[0]
  if (!row) return undefined
  return decrypt(masterKey, row.nonce, row.ciphertext)
}

/** PostgreSQL (or in-memory) credentials provider. */
export class PgCredentialProvider extends CredentialProvider {
  static Config: z<Config> = z.object({
    url: z.string().required(),
    masterKey: z.string().required(),
  })

  private readonly spec: Config
  private readonly memory = new Map<string, StoredRow>()
  private pool: pg.Pool | undefined
  private closed = false

  constructor(ctx: Context, public config: Config) {
    super(ctx)
    this.spec = resolveSpec(config)
  }

  private isMemory(): boolean {
    return this.spec.url === MEMORY_URL
  }

  private isClosed(): boolean {
    return this.closed
  }

  private ambient(ref: CredentialRef): string | undefined {
    const entry = launchEnvironmentOf(this.ctx).get(ref)
    return entry !== undefined && entry.value.length > 0 ? entry.value : undefined
  }

  async* [Service.init](): AsyncGenerator<() => Promise<void> | void, void, void> {
    yield async () => {
      this.closed = true
      /* v8 ignore start -- postgres pool teardown is covered by DATABASE_URL integration */
      if (this.pool !== undefined) {
        const pool = this.pool
        this.pool = undefined
        await pool.end()
      }
      /* v8 ignore stop */
    }
    /* v8 ignore start -- postgres pool construction is covered by DATABASE_URL integration */
    if (!this.isMemory()) {
      this.pool = new pg.Pool({ connectionString: this.spec.url })
    }
    /* v8 ignore stop */
  }

  override async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const stored = await this.readVault(ref)
    if (stored !== undefined) return { value: stored, source: 'vault' }
    const ambient = this.ambient(ref)
    if (ambient !== undefined) return { value: ambient, source: 'env' }
    return undefined
  }

  override async describe(ref: CredentialRef): Promise<CredentialInfo> {
    const hit = await this.resolve(ref)
    if (!hit) return { configured: false, writable: true }
    return { configured: true, source: hit.source, writable: true }
  }

  override async set(ref: CredentialRef, value: string): Promise<void> {
    if (value.length === 0) {
      throw new Error(`credentials-pg: an empty value cannot be stored for "${ref}"; use unset`)
    }
    this.assertOpen('set', ref)
    await this.writeVault(ref, value)
    this.notifyUpdated(ref)
  }

  override async unset(ref: CredentialRef): Promise<void> {
    this.assertOpen('unset', ref)
    const existed = await this.deleteVault(ref)
    if (existed) this.notifyUpdated(ref)
  }

  private assertOpen(verb: 'set' | 'unset', ref: CredentialRef): void {
    if (this.isClosed()) {
      throw new Error(`credentials-pg is disposed: cannot ${verb} "${ref}"`)
    }
  }

  private async readVault(ref: CredentialRef): Promise<string | undefined> {
    /* v8 ignore start -- postgres read is covered by DATABASE_URL integration */
    if (!this.isMemory()) {
      if (this.pool === undefined) return undefined
      return lookupSecret(this.pool, this.spec.masterKey, ref)
    }
    /* v8 ignore stop */
    const row = this.memory.get(ref)
    return row ? decrypt(this.spec.masterKey, row.nonce, row.ciphertext) : undefined
  }

  private async writeVault(ref: CredentialRef, value: string): Promise<void> {
    const stored = encrypt(this.spec.masterKey, value)
    /* v8 ignore start -- postgres write is covered by DATABASE_URL integration */
    if (!this.isMemory()) {
      if (this.pool === undefined) {
        throw new Error(`credentials-pg is disposed: cannot set "${ref}"`)
      }
      await this.pool.query(
        `INSERT INTO credential_secrets (ref, nonce, ciphertext, updated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (ref) DO UPDATE SET
           nonce = excluded.nonce, ciphertext = excluded.ciphertext,
           updated_at = now(), updated_by = excluded.updated_by`,
        [ref, stored.nonce, stored.ciphertext, 'credentials-pg'],
      )
      return
    }
    /* v8 ignore stop */
    this.memory.set(ref, stored)
  }

  private async deleteVault(ref: CredentialRef): Promise<boolean> {
    /* v8 ignore start -- postgres delete is covered by DATABASE_URL integration */
    if (!this.isMemory()) {
      if (this.pool === undefined) {
        throw new Error(`credentials-pg is disposed: cannot unset "${ref}"`)
      }
      const res = await this.pool.query('DELETE FROM credential_secrets WHERE ref = $1', [ref])
      return (res.rowCount ?? 0) > 0
    }
    /* v8 ignore stop */
    return this.memory.delete(ref)
  }
}

export default PgCredentialProvider
