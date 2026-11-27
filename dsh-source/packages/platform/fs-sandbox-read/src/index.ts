/**
 * Employee-path filesystem backend: keep dsh-fs-sandbox mutation fencing, and
 * also deny observation (stat/read/list/watch/lstat) outside the session workspace.
 *
 * Readable roots are the policy workspace plus explicit extra directories —
 * not platform temp. `/tmp` stays writable for tool scratch files, but listing
 * or reading another process's temp file is a session leak.
 *
 * `danger-full-access` stays unfenced. This is containment in trusted code
 * (canonicalize-then-contain), not a kernel boundary.
 *
 * @module @deepseek-ai/dsh-fs-sandbox-read
 */

import { statSync } from 'node:fs'
import { basename, dirname, join, sep } from 'node:path'
import { SandboxedFileSystem } from '@deepseek-ai/dsh-fs-sandbox'
import { isPathUnder } from '@deepseek-ai/dsh-fs-sandbox/src/containment.ts'
import { FsError, fsErrorFromErrno } from '@deepseek-ai/dsh-fs'
import type {
  FsDirEntry,
  FsInfo,
  FsPathInfo,
  FsTarget,
} from '@deepseek-ai/dsh-fs'
import { expandHomePrefix, localDisplayPath } from '@deepseek-ai/dsh-fs-local/src/fsio.ts'
import { canonicalPath } from '@deepseek-ai/dsh-sandbox'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type {} from '@deepseek-ai/dsh-sandbox-policy'

/**
 * Roots a confined session may observe. Unlike write grants, this list does
 * not include `/tmp` or `os.tmpdir()`. `danger-full-access` skips the fence.
 */
function readableRoots(policy: SandboxExecutionPolicy): string[] {
  const extra = policy.additionalWritableRoots ?? []
  return [...new Set([canonicalPath(policy.workspaceRoot), ...extra.map(path => canonicalPath(path))])]
}

function isLexicallyUnder(path: string, root: string, caseSensitive: boolean): boolean {
  const comparableTarget = caseSensitive ? path : path.toLowerCase()
  const comparableRoot = caseSensitive ? root : root.toLowerCase()
  if (comparableTarget === comparableRoot) return true
  const prefix = comparableRoot.endsWith(sep) ? comparableRoot : comparableRoot + sep
  return comparableTarget.startsWith(prefix)
}

/**
 * Sync twin of `isPathUnder` for `processPathFromHostPath` (the seam is sync).
 * Keep the lexical + identity walk aligned with `@deepseek-ai/dsh-fs-sandbox/src/containment.ts`.
 */
function isPathUnderSync(path: string, root: string, caseSensitive = process.platform !== 'win32'): boolean {
  if (isLexicallyUnder(path, root, caseSensitive)) return true
  let rootInfo: ReturnType<typeof statSync> | undefined
  try {
    rootInfo = statSync(root, { bigint: true })
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return false
    throw fsErrorFromErrno('stat', root, error)
  }
  let ancestor = path
  while (true) {
    try {
      const ancestorInfo = statSync(ancestor, { bigint: true })
      if (ancestorInfo.dev === rootInfo.dev && ancestorInfo.ino === rootInfo.ino) return true
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw fsErrorFromErrno('stat', ancestor, error)
    }
    const parent = dirname(ancestor)
    if (parent === ancestor) return false
    ancestor = parent
  }
}

async function underReadable(path: string, policy: SandboxExecutionPolicy): Promise<boolean> {
  for (const root of readableRoots(policy)) {
    if (await isPathUnder(path, root)) return true
  }
  return false
}

function underReadableSync(path: string, policy: SandboxExecutionPolicy): boolean {
  const canonical = canonicalPath(path)
  for (const root of readableRoots(policy)) {
    if (isPathUnderSync(canonical, root)) return true
  }
  return false
}

/** Parent realpath + final component, so a symlink node is fenced without following it. */
function unfollowedCanonical(cwd: string, path: string): string {
  const display = localDisplayPath(cwd, expandHomePrefix(path))
  const name = basename(display)
  if (name === '' || name === '.' || name === '..') return canonicalPath(display)
  return join(canonicalPath(dirname(display)), name)
}

function denied(displayPath: string, mode: SandboxExecutionPolicy['mode']): FsError {
  return new FsError(`cannot read "${displayPath}": file access denied under ${mode} mode`, 'FS_SANDBOX_DENIED')
}

export class ReadSandboxedFileSystem extends SandboxedFileSystem {
  /**
   * Re-canonicalize `target` (follows the final symlink) and require it under
   * a readable root. `danger-full-access` returns the caller's target unfenced.
   */
  private async checkedReadTarget(target: FsTarget): Promise<FsTarget> {
    const policy = this.ctx.sandboxPolicy.resolve()
    if (policy.mode === 'danger-full-access') return target
    const fresh = await this.resolve(target.displayPath)
    if (await underReadable(fresh.targetKey, policy)) return fresh
    throw denied(target.displayPath, policy.mode)
  }

  override async stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    return super.stat(await this.checkedReadTarget(target), signal)
  }

  override async lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined> {
    const policy = this.ctx.sandboxPolicy.resolve()
    if (policy.mode !== 'danger-full-access') {
      if (path.trim().length === 0) return super.lstat(path, opts, signal)
      const node = unfollowedCanonical(opts?.cwd ?? this.config.cwd, path)
      const caseSensitive = process.platform !== 'win32'
      const inside = readableRoots(policy).some(root => isLexicallyUnder(node, root, caseSensitive))
      if (!inside) throw denied(path, policy.mode)
    }
    return super.lstat(path, opts, signal)
  }

  override async readText(target: FsTarget, signal?: AbortSignal): Promise<string> {
    return super.readText(await this.checkedReadTarget(target), signal)
  }

  override async streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    return super.streamText(await this.checkedReadTarget(target), signal)
  }

  override async readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array> {
    return super.readBytes(await this.checkedReadTarget(target), signal, maxBytes)
  }

  override async readByteRange(
    target: FsTarget,
    range: { offset: number; length: number },
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    return super.readByteRange(await this.checkedReadTarget(target), range, signal)
  }

  override async listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]> {
    return super.listDir(await this.checkedReadTarget(target), signal)
  }

  override async watch(
    target: FsTarget,
    changed: (error?: Error) => void,
    signal: AbortSignal,
  ): Promise<() => Promise<void>> {
    return super.watch(await this.checkedReadTarget(target), changed, signal)
  }

  override processPathFromHostPath(hostPath: string): string | undefined {
    const mapped = super.processPathFromHostPath(hostPath)
    if (mapped === undefined) return undefined
    const policy = this.ctx.sandboxPolicy.resolve()
    if (policy.mode === 'danger-full-access') return mapped
    return underReadableSync(mapped, policy) ? mapped : undefined
  }
}

export default ReadSandboxedFileSystem
