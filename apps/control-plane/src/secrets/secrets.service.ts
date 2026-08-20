import type { AuditStore } from '../common/audit.store.js'
import type { SecretMeta } from './vault.js'
import { CredentialVault } from './vault.js'

/** Env name → vault ref. First hit wins when several env names map to one ref. */
export const BOOTSTRAP: ReadonlyArray<{ env: string; ref: string }> = [
  { env: 'DS_API_KEY', ref: 'DEEPSEEK_API_KEY' },
  { env: 'DEEPSEEK_API_KEY', ref: 'DEEPSEEK_API_KEY' },
  { env: 'EMBED_API_KEY', ref: 'EMBED_API_KEY' },
  { env: 'CP_OIDC_CLIENT_SECRET', ref: 'CP_OIDC_CLIENT_SECRET' },
  { env: 'CP_DINGTALK_CLIENT_SECRET', ref: 'CP_DINGTALK_CLIENT_SECRET' },
]

export type SecretSource = 'vault' | 'env'

export interface SecretInfo {
  configured: boolean
  source?: SecretSource
  writable: boolean
}

export interface ResolveAudit {
  via?: string
  actorId?: string
}

export function masterKeyOf(env: NodeJS.ProcessEnv): string {
  const master = env.SECRETS_MASTER_KEY || env.CP_JWT_SECRET || ''
  if (!master) throw new Error('credential vault: set SECRETS_MASTER_KEY (or CP_JWT_SECRET as local fallback)')
  return master
}

/**
 * Resolve one credential: vault first (so admin rotation wins), then process env.
 * Never cache — callers re-resolve per operation (DSH credentials seam).
 */
export class SecretsService {
  constructor(
    private readonly vault: CredentialVault,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly audit?: AuditStore,
  ) {}

  private async lookup(ref: string): Promise<{ value: string; source: SecretSource } | undefined> {
    const stored = await this.vault.get(ref)
    if (stored) return { value: stored, source: 'vault' }
    const ambient = this.env[ref]
    if (ambient && ambient.length > 0) return { value: ambient, source: 'env' }
    return undefined
  }

  async resolve(ref: string, ctx?: ResolveAudit): Promise<{ value: string; source: SecretSource } | undefined> {
    const hit = await this.lookup(ref)
    if (this.audit) {
      await this.audit.append({
        userId: ctx?.actorId,
        eventType: 'secrets.resolve',
        payload: { ref, source: hit?.source ?? null, configured: Boolean(hit), via: ctx?.via ?? 'service' },
      })
    }
    return hit
  }

  async describe(ref: string): Promise<SecretInfo> {
    const hit = await this.lookup(ref)
    if (!hit) return { configured: false, writable: true }
    return { configured: true, source: hit.source, writable: true }
  }

  async set(ref: string, value: string, updatedBy?: string): Promise<void> {
    await this.vault.set(ref, value, updatedBy)
  }

  async unset(ref: string): Promise<void> {
    await this.vault.unset(ref)
  }

  async list(): Promise<SecretMeta[]> {
    return this.vault.list()
  }

  /**
   * Copy bootstrap env values into the vault when the ref is not yet stored.
   * Does not overwrite — an admin rotation must survive the next restart.
   */
  async bootstrap(): Promise<string[]> {
    const seeded: string[] = []
    const seen = new Set<string>()
    for (const { env, ref } of BOOTSTRAP) {
      if (seen.has(ref)) continue
      const value = this.env[env]
      if (!value) continue
      if (await this.vault.get(ref)) {
        seen.add(ref)
        continue
      }
      await this.vault.set(ref, value, 'bootstrap')
      seen.add(ref)
      seeded.push(ref)
    }
    return seeded
  }
}
