import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'
import { ReadSandboxedFileSystem } from '../src/index.ts'

let base: string
let workspace: string
let outside: string
let extra: string
let ctx: Context
let fs: ReadSandboxedFileSystem
let fiber: Awaited<ReturnType<Context['plugin']>>

async function boot(mode: SandboxMode, additionalWritableRoots?: string[]): Promise<void> {
  ctx = new Context()
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SandboxPolicyService, {
    mode,
    workspaceRoot: workspace,
    ...additionalWritableRoots === undefined ? {} : { additionalWritableRoots },
  })
  fiber = await ctx.plugin(ReadSandboxedFileSystem, { cwd: workspace })
  fs = ctx.fs as ReadSandboxedFileSystem
}

beforeEach(async ({ onTestFinished }) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-fsread-'))
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true })
  })
  base = realpathSync.native(directory)
  workspace = join(base, 'ws')
  outside = join(base, 'out')
  extra = join(base, 'extra')
  await mkdir(workspace)
  await mkdir(outside)
  await mkdir(extra)
})

afterEach(async () => {
  await fiber?.dispose()
})

describe.each(['workspace-write', 'read-only'] as const)('%s confines observation', mode => {
  beforeEach(() => boot(mode))

  it('reads a file inside the session workspace', async () => {
    const path = join(workspace, 'ok.txt')
    await writeFile(path, 'inside')
    expect(await fs.readText(await fs.resolve(path))).toBe('inside')
  })

  it('denies reading an absolute path outside the workspace', async () => {
    const path = join(outside, 'secret.txt')
    await writeFile(path, 'leaked')
    await expect(fs.readText(await fs.resolve(path))).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
  })

  it('denies stat, listDir, and lstat outside the workspace', async () => {
    await writeFile(join(outside, 'secret.txt'), 'leaked')
    await expect(fs.stat(await fs.resolve(outside))).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
    await expect(fs.listDir(await fs.resolve(outside))).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
    await expect(fs.lstat(outside)).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
  })
})

describe('workspace-write read fence', () => {
  beforeEach(() => boot('workspace-write'))

  it('lists the session workspace', async () => {
    await writeFile(join(workspace, 'a.txt'), 'a')
    const entries = await fs.listDir(await fs.resolve(workspace))
    expect(entries.map(entry => entry.name)).toEqual(['a.txt'])
  })

  it('denies a `..` traversal out of the workspace', async () => {
    await writeFile(join(outside, 'secret.txt'), 'leaked')
    const path = join(workspace, '..', 'out', 'secret.txt')
    await expect(fs.readText(await fs.resolve(path))).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
  })

  it('denies a symlink inside the workspace that points out', async () => {
    await writeFile(join(outside, 'secret.txt'), 'leaked')
    await symlink(outside, join(workspace, 'link'))
    await expect(fs.readText(await fs.resolve(join(workspace, 'link', 'secret.txt'))))
      .rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
  })

  it('lstats a symlink inside the workspace without following it', async () => {
    await writeFile(join(outside, 'secret.txt'), 'leaked')
    await symlink(join(outside, 'secret.txt'), join(workspace, 'link'))
    const info = await fs.lstat(join(workspace, 'link'))
    expect(info?.type).toBe('symlink')
    await expect(fs.readText(await fs.resolve(join(workspace, 'link'))))
      .rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
  })

  it('denies lstat of an outside symlink that points into the workspace', async () => {
    await writeFile(join(workspace, 'ok.txt'), 'inside')
    await symlink(join(workspace, 'ok.txt'), join(outside, 'inward'))
    await symlink(workspace, join(outside, 'ws-root'))
    await expect(fs.lstat(join(outside, 'inward'))).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
    await expect(fs.lstat(join(outside, 'ws-root'))).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
  })

  it('denies watch outside the workspace', async () => {
    const signal = AbortSignal.timeout(2_000)
    await expect(fs.watch(await fs.resolve(outside), () => {}, signal))
      .rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
  })

  it('watches a file inside the session workspace', async () => {
    const path = join(workspace, 'w.txt')
    await writeFile(path, 'a')
    const close = await fs.watch(await fs.resolve(path), () => {}, new AbortController().signal)
    await close()
  })

  it('still allows writes inside the workspace', async () => {
    const path = join(workspace, 'new.txt')
    await fs.writeText(await fs.resolve(path), 'created')
    expect(await fs.readText(await fs.resolve(path))).toBe('created')
  })

  it('does not map host paths outside the workspace', () => {
    expect(fs.processPathFromHostPath(join(outside, 'secret.txt'))).toBeUndefined()
    expect(fs.processPathFromHostPath(join(workspace, 'ok.txt'))).toBe(join(workspace, 'ok.txt'))
  })

  it('allows writing scratch files under platform temp but does not let the session read them', async () => {
    const scratch = join(tmpdir(), `dsh-fsread-scratch-${Date.now()}.txt`)
    await fs.writeText(await fs.resolve(scratch), 'scratch')
    await expect(fs.readText(await fs.resolve(scratch))).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
    await rm(scratch, { force: true })
  })
})

describe('additionalWritableRoots', () => {
  beforeEach(() => boot('workspace-write', [extra]))

  it('reads a file under an extra granted root', async () => {
    const path = join(extra, 'grant.txt')
    await writeFile(path, 'granted')
    expect(await fs.readText(await fs.resolve(path))).toBe('granted')
  })

  it('still denies a sibling that is not granted', async () => {
    const path = join(outside, 'secret.txt')
    await writeFile(path, 'leaked')
    await expect(fs.readText(await fs.resolve(path))).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
  })

  it('maps host paths under the extra root and lstats them', async () => {
    const path = join(extra, 'grant.txt')
    await writeFile(path, 'granted')
    expect(fs.processPathFromHostPath(path)).toBe(path)
    expect(await fs.lstat(path)).toMatchObject({ type: 'file' })
    const close = await fs.watch(await fs.resolve(path), () => {}, new AbortController().signal)
    await close()
  })
})

describe('danger-full-access', () => {
  beforeEach(() => boot('danger-full-access'))

  it('reads outside the workspace', async () => {
    const path = join(outside, 'secret.txt')
    await writeFile(path, 'open')
    expect(await fs.readText(await fs.resolve(path))).toBe('open')
  })

  it('maps host paths outside the workspace', () => {
    expect(fs.processPathFromHostPath(join(outside, 'secret.txt'))).toBe(join(outside, 'secret.txt'))
  })
})
