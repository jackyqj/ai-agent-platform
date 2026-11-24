import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import PgCredentialProvider from '../src/index.ts'

const KEY = credentialRef('DEEPSEEK_API_KEY')
const RESOLVE_URL = 'http://cp.example/api/internal/secrets'
const TOKEN = 'cp_instance_token'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  while (cleanups.length > 0) await cleanups.pop()!()
})

async function bootHttp(fetchImpl: typeof fetch): Promise<Context> {
  vi.stubGlobal('fetch', fetchImpl)
  const ctx = new Context()
  const fiber = ctx.plugin(PgCredentialProvider, { resolveUrl: RESOLVE_URL, token: TOKEN })
  cleanups.push(async () => { await fiber.dispose() })
  await fiber
  return ctx
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function updates(ctx: Context): CredentialRef[] {
  const seen: CredentialRef[] = []
  ctx.on('credentials/reference-updated', (ref) => { seen.push(ref) })
  return seen
}

describe('HTTP resolve mode', () => {
  it('constructs without a master key when resolveUrl and token are set', () => {
    const ctx = new Context()
    expect(() => new PgCredentialProvider(ctx, { resolveUrl: RESOLVE_URL, token: TOKEN })).not.toThrow()
  })

  it('rejects resolveUrl without a token', () => {
    const ctx = new Context()
    expect(() => new PgCredentialProvider(ctx, { resolveUrl: RESOLVE_URL, token: '' })).toThrow(/token/)
  })

  it('prefers HTTP over a present master key so interactive containers never decrypt', () => {
    const ctx = new Context()
    expect(() => new PgCredentialProvider(ctx, {
      url: 'memory:',
      masterKey: 'should-not-be-required-path',
      resolveUrl: RESOLVE_URL,
      token: TOKEN,
    })).not.toThrow()
  })

  it('resolves per request through the control plane and never caches', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ value: 'sk-first', source: 'vault' }))
      .mockResolvedValueOnce(jsonResponse({ value: 'sk-rotated', source: 'vault' }))
    const ctx = await bootHttp(fetch)
    expect(await ctx.credentials.resolve(KEY)).toEqual({ value: 'sk-first', source: 'vault' })
    expect(await ctx.credentials.resolve(KEY)).toEqual({ value: 'sk-rotated', source: 'vault' })
    expect(fetch).toHaveBeenCalledTimes(2)
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toBe(`${RESOLVE_URL}/${KEY}`)
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(TOKEN)
  })

  it('treats HTTP 404 as unconfigured', async () => {
    const ctx = await bootHttp(vi.fn().mockResolvedValue(jsonResponse({ error: 'not found' }, 404)))
    expect(await ctx.credentials.resolve(KEY)).toBeUndefined()
    expect(await ctx.credentials.describe(KEY)).toEqual({ configured: false, writable: false })
  })

  it('falls back to env when the control plane has no value', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'from-env')
    const ctx = await bootHttp(vi.fn().mockResolvedValue(jsonResponse({}, 404)))
    expect(await ctx.credentials.resolve(KEY)).toEqual({ value: 'from-env', source: 'env' })
  })

  it('never puts the secret in describe and marks HTTP mode read-only', async () => {
    const ctx = await bootHttp(vi.fn().mockResolvedValue(jsonResponse({ value: 'sk-http', source: 'vault' })))
    const info = await ctx.credentials.describe(KEY)
    expect(info).toEqual({ configured: true, source: 'vault', writable: false })
    expect(JSON.stringify(info)).not.toContain('sk-http')
  })

  it('rejects writes over HTTP resolve', async () => {
    const ctx = await bootHttp(vi.fn().mockResolvedValue(jsonResponse({}, 404)))
    const seen = updates(ctx)
    await expect(ctx.credentials.set(KEY, 'nope')).rejects.toThrow(/read-only/)
    await expect(ctx.credentials.unset(KEY)).rejects.toThrow(/read-only/)
    expect(seen).toEqual([])
  })

  it('fails loud when the control plane rejects the token', async () => {
    const ctx = await bootHttp(vi.fn().mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401)))
    await expect(ctx.credentials.resolve(KEY)).rejects.toThrow(/401/)
  })
})
