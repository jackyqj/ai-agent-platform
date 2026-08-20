import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import pg from 'pg'
import PgCredentialProvider, { encrypt, lookupSecret } from '../src/index.ts'

const KEY = credentialRef('DEEPSEEK_API_KEY')
const MASTER = 'test-master-key-not-for-prod'

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.PG_DSN
const describeDb = DATABASE_URL ? describe : describe.skip

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  vi.unstubAllEnvs()
  while (cleanups.length > 0) await cleanups.pop()!()
})

async function boot(config: ConstructorParameters<typeof PgCredentialProvider>[1] = {
  url: 'memory:',
  masterKey: MASTER,
}): Promise<Context> {
  const ctx = new Context()
  const fiber = ctx.plugin(PgCredentialProvider, config)
  cleanups.push(async () => { await fiber.dispose() })
  await fiber
  return ctx
}

function updates(ctx: Context): CredentialRef[] {
  const seen: CredentialRef[] = []
  ctx.on('credentials/updated', (ref) => { seen.push(ref) })
  return seen
}

describe('config', () => {
  it('rejects a missing master key at construction', () => {
    const ctx = new Context()
    expect(() => new PgCredentialProvider(ctx, { url: 'memory:', masterKey: '' })).toThrow(/master key/)
  })

  it('rejects a missing url at construction', () => {
    const ctx = new Context()
    expect(() => new PgCredentialProvider(ctx, { url: '', masterKey: MASTER })).toThrow(/url/)
  })
})

describe('memory store layering', () => {
  it('treats an empty store as unconfigured and writable', async () => {
    const ctx = await boot()
    expect(await ctx.credentials.resolve(KEY)).toBeUndefined()
    expect(await ctx.credentials.describe(KEY)).toEqual({ configured: false, writable: true })
  })

  it('serves a stored value as source vault and never puts the secret in describe', async () => {
    const ctx = await boot()
    await ctx.credentials.set(KEY, 'sk-stored')
    expect(await ctx.credentials.resolve(KEY)).toEqual({ value: 'sk-stored', source: 'vault' })
    const info = await ctx.credentials.describe(KEY)
    expect(info).toEqual({ configured: true, source: 'vault', writable: true })
    expect(JSON.stringify(info)).not.toContain('sk-stored')
  })

  it('lets vault win over a process-environment value so rotation takes effect', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'from-env')
    const ctx = await boot()
    expect(await ctx.credentials.resolve(KEY)).toEqual({ value: 'from-env', source: 'env' })
    await ctx.credentials.set(KEY, 'from-vault')
    expect(await ctx.credentials.resolve(KEY)).toEqual({ value: 'from-vault', source: 'vault' })
  })

  it('treats an empty environment value as absent', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '')
    const ctx = await boot()
    await ctx.credentials.set(KEY, 'stored')
    expect(await ctx.credentials.resolve(KEY)).toEqual({ value: 'stored', source: 'vault' })
  })

  it('falls back to env after unset when the environment still supplies a value', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'from-env')
    const ctx = await boot()
    await ctx.credentials.set(KEY, 'from-vault')
    await ctx.credentials.unset(KEY)
    expect(await ctx.credentials.resolve(KEY)).toEqual({ value: 'from-env', source: 'env' })
  })

  it('returns the rotated value on the next resolve without caching', async () => {
    const ctx = await boot()
    await ctx.credentials.set(KEY, 'first')
    expect((await ctx.credentials.resolve(KEY))?.value).toBe('first')
    await ctx.credentials.set(KEY, 'second')
    expect((await ctx.credentials.resolve(KEY))?.value).toBe('second')
  })
})

describe('writes', () => {
  it('rejects an empty value', async () => {
    const ctx = await boot()
    await expect(ctx.credentials.set(KEY, '')).rejects.toThrow(/empty/)
  })

  it('emits credentials/updated after a committed set and unset', async () => {
    const ctx = await boot()
    const seen = updates(ctx)
    await ctx.credentials.set(KEY, 'one')
    await ctx.credentials.unset(KEY)
    expect(seen).toEqual([KEY, KEY])
  })

  it('treats unset of an absent reference as a no-op', async () => {
    const ctx = await boot()
    const seen = updates(ctx)
    await ctx.credentials.unset(KEY)
    expect(seen).toEqual([])
  })

  it('refuses writes after disposal', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(PgCredentialProvider, { url: 'memory:', masterKey: MASTER })
    await fiber
    const service = ctx.credentials
    await fiber.dispose()
    await expect(service.set(KEY, 'late')).rejects.toThrow(/disposed/)
  })
})

describe('lookupSecret', () => {
  it('decrypts a row from the query surface', async () => {
    const stored = encrypt(MASTER, 'sk-helper')
    const query = {
      query: async () => ({ rows: [stored] }),
    }
    expect(await lookupSecret(query, MASTER, KEY)).toBe('sk-helper')
  })

  it('returns undefined when the row is absent', async () => {
    const query = {
      query: async () => ({ rows: [] }),
    }
    expect(await lookupSecret(query, MASTER, KEY)).toBeUndefined()
  })

  it('rejects a non-identifier ref', async () => {
    const query = { query: async () => ({ rows: [] }) }
    await expect(lookupSecret(query, MASTER, 'not a ref!')).rejects.toThrow(/must match/)
  })
})

describeDb('postgres store', () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL })
  const ref = credentialRef('DSH_CRED_PG_LIVE')

  afterEach(async () => {
    await pool.query('DELETE FROM credential_secrets WHERE ref = $1', [ref]).catch(() => undefined)
  })

  it('round-trips through credential_secrets so a later process sees the write', async () => {
    const ctx = await boot({ url: DATABASE_URL!, masterKey: MASTER })
    await ctx.credentials.set(ref, 'sk-pg')
    expect(await ctx.credentials.resolve(ref)).toEqual({ value: 'sk-pg', source: 'vault' })
    const ctx2 = await boot({ url: DATABASE_URL!, masterKey: MASTER })
    expect(await ctx2.credentials.resolve(ref)).toEqual({ value: 'sk-pg', source: 'vault' })
    expect(await lookupSecret(pool, MASTER, ref)).toBe('sk-pg')
    await ctx2.credentials.unset(ref)
    expect(await ctx2.credentials.resolve(ref)).toBeUndefined()
  })
})
