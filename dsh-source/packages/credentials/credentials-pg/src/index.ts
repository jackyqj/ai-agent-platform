/**
 * PostgreSQL-backed credentials provider for the D20 vault (`credential_secrets`).
 * Vault wins over the process environment so an admin rotation reaches the next
 * `resolve` without restarting the runtime. Values are never cached.
 *
 * Two backends: direct PG decrypt (trusted worker) or HTTP resolve against the
 * control plane (interactive containers that must not hold the master key).
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
import type {
  CredentialInfo, CredentialKey, CredentialRecord, CredentialRecordEntry, CredentialRecordInfo,
  CredentialRef, ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { decrypt, encrypt } from './crypto.ts'

export { decrypt, encrypt } from './crypto.ts'

const MEMORY_URL = 'memory:'
const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export interface Config {
  /** PostgreSQL connection string, or the literal `memory:` for in-process tests. */
  url?: string
  /** Vault master secret (`SECRETS_MASTER_KEY`, local fallback `CP_JWT_SECRET`). */
  masterKey?: string
  /** Control-plane resolve base URL; when set, the process never sees the master key. */
  resolveUrl?: string
  /** `X-API-Key` for HTTP resolve (`secrets:resolve` scope). */
  token?: string
}

export type ResolvedSpec =
  | { mode: 'http'; resolveUrl: string; token: string }
  | { mode: 'pg'; url: string; masterKey: string }

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
 * Plugin config: HTTP resolveUrl+token, or a postgres url and master key.
 * Defaulting happens here, never inline.
 */
export function resolveSpec(config: Config): ResolvedSpec {
  const resolveUrl = (config.resolveUrl ?? '').replace(/\/$/, '')
  const token = config.token ?? ''
  if (resolveUrl) {
    if (!token) throw new Error('credentials-pg: token is required when resolveUrl is set')
    return { mode: 'http', resolveUrl, token }
  }
  if (!config.url) throw new Error('credentials-pg: url is required (postgres URL, or memory: for tests)')
  if (!config.masterKey) throw new Error('credentials-pg: master key is empty')
  return { mode: 'pg', url: config.url, masterKey: config.masterKey }
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
    url: z.string().default(''),
    masterKey: z.string().default(''),
    resolveUrl: z.string().default(''),
    token: z.string().default(''),
  })

  private readonly spec: ResolvedSpec
  private readonly memory = new Map<string, StoredRow>()
  private readonly records = new Map<string, CredentialRecord>()
  private pool: pg.Pool | undefined
  private closed = false

  constructor(ctx: Context, public config: Config) {
    super(ctx)
    this.spec = resolveSpec(config)
  }

  private isHttp(): boolean {
    return this.spec.mode === 'http'
  }

  private isMemory(): boolean {
    return this.spec.mode === 'pg' && this.spec.url === MEMORY_URL
  }

  private isClosed(): boolean {
    return this.closed
  }

  private writable(): boolean {
    return !this.isHttp()
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
    if (this.spec.mode === 'pg' && this.spec.url !== MEMORY_URL) {
      this.pool = new pg.Pool({ connectionString: this.spec.url })
    }
    /* v8 ignore stop */
  }

  override async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const stored = await this.readVault(ref)
    if (stored !== undefined) return stored
    const ambient = this.ambient(ref)
    if (ambient !== undefined) return { value: ambient, source: 'env' }
    return undefined
  }

  override async describe(ref: CredentialRef): Promise<CredentialInfo> {
    const hit = await this.resolve(ref)
    if (!hit) return { configured: false, writable: this.writable() }
    return { configured: true, source: hit.source, writable: this.writable() }
  }

  override async set(ref: CredentialRef, value: string): Promise<void> {
    this.assertWritable('set', ref)
    if (value.length === 0) {
      throw new Error(`credentials-pg: an empty value cannot be stored for "${ref}"; use unset`)
    }
    this.assertOpen('set', ref)
    await this.writeVault(ref, value)
    this.notifyUpdated(ref)
  }

  override async unset(ref: CredentialRef): Promise<void> {
    this.assertWritable('unset', ref)
    this.assertOpen('unset', ref)
    const existed = await this.deleteVault(ref)
    if (existed) this.notifyUpdated(ref)
  }

  override async readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    return this.records.get(key)
  }

  override async describeRecord(key: CredentialKey): Promise<CredentialRecordInfo> {
    const record = this.records.get(key)
    if (record === undefined) return { configured: false, writable: this.writable() }
    return { configured: true, kind: record.kind, writable: this.writable() }
  }

  override async listRecords(): Promise<readonly CredentialRecordEntry[]> {
    return [...this.records.entries()].map(([key, record]) => ({
      key: key as CredentialKey,
      kind: record.kind,
    }))
  }

  override async modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    if (this.isHttp()) throw new Error(`credentials-pg: HTTP resolve is read-only; cannot modify record "${key}"`)
    if (this.isClosed()) throw new Error(`credentials-pg is disposed: cannot modify record "${key}"`)
    const current = this.records.get(key)
    const next = await mutate(current)
    if (next === undefined) return current
    this.records.set(key, next)
    this.notifyRecordUpdated(key)
    return next
  }

  override async deleteRecord(key: CredentialKey): Promise<void> {
    if (this.isHttp()) throw new Error(`credentials-pg: HTTP resolve is read-only; cannot delete record "${key}"`)
    if (this.isClosed()) throw new Error(`credentials-pg is disposed: cannot delete record "${key}"`)
    if (this.records.delete(key)) this.notifyRecordUpdated(key)
  }

  private assertWritable(verb: 'set' | 'unset', ref: CredentialRef): void {
    if (this.isHttp()) {
      throw new Error(`credentials-pg: HTTP resolve is read-only; cannot ${verb} "${ref}"`)
    }
  }

  private assertOpen(verb: 'set' | 'unset', ref: CredentialRef): void {
    if (this.isClosed()) {
      throw new Error(`credentials-pg is disposed: cannot ${verb} "${ref}"`)
    }
  }

  private async readVault(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    if (this.spec.mode === 'http') return this.readHttp(ref)
    const value = await this.readPg(ref)
    return value !== undefined ? { value, source: 'vault' } : undefined
  }

  private async readHttp(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    if (this.spec.mode !== 'http') return undefined
    const res = await fetch(`${this.spec.resolveUrl}/${encodeURIComponent(ref)}`, {
      headers: { 'x-api-key': this.spec.token },
    })
    if (res.status === 404) return undefined
    if (!res.ok) throw new Error(`credentials-pg: HTTP resolve "${ref}" failed: ${res.status}`)
    const body = (await res.json()) as { value?: unknown; source?: unknown }
    if (typeof body.value !== 'string' || body.value.length === 0) return undefined
    const source = typeof body.source === 'string' && body.source.length > 0 ? body.source : 'vault'
    return { value: body.value, source }
  }

  private async readPg(ref: CredentialRef): Promise<string | undefined> {
    if (this.spec.mode !== 'pg') return undefined
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
    if (this.spec.mode !== 'pg') {
      throw new Error(`credentials-pg: HTTP resolve is read-only; cannot set "${ref}"`)
    }
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
    if (this.spec.mode !== 'pg') {
      throw new Error(`credentials-pg: HTTP resolve is read-only; cannot unset "${ref}"`)
    }
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
