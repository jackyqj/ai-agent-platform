import { mkdirSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SESSION_ID = /^[A-Za-z0-9._-]+$/

/** Writable leaf under each session slot so JSONL does not scan agent files as logs. */
export const SESSION_WORKSPACE_LEAF = 'cwd'

export function resolveTaskWorkerDir(fromModuleUrl: string): string {
  return fileURLToPath(new URL('..', fromModuleUrl))
}

export function resolveSessionRoot(fromModuleUrl: string, sessionRootOverride?: string): string {
  const appDir = resolveTaskWorkerDir(fromModuleUrl)
  const override = sessionRootOverride?.trim()
  if (override) return resolve(appDir, override)
  return join(appDir, '.sessions-worker')
}

export function resolveWorkspacesParent(sessionRoot: string, cwdOverride?: string): string {
  const override = cwdOverride?.trim()
  if (override) return resolve(sessionRoot, override)
  return join(sessionRoot, 'workspaces')
}

export function assertSafeSessionId(id: string): string {
  if (id === '.' || id === '..' || !SESSION_ID.test(id)) {
    throw new Error(`invalid session id for workspace path: ${JSON.stringify(id)}`)
  }
  return id
}

export function resolveSessionWorkspace(parent: string, sessionId: string): string {
  return join(parent, assertSafeSessionId(sessionId), SESSION_WORKSPACE_LEAF)
}

export function ensureSessionWorkspace(parent: string, sessionId: string): string {
  mkdirSync(parent, { recursive: true })
  const workspace = resolveSessionWorkspace(parent, sessionId)
  mkdirSync(workspace, { recursive: true })
  const realParent = realpathSync(parent)
  const realWorkspace = realpathSync(workspace)
  const rel = relative(realParent, realWorkspace)
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`session workspace escaped workspaces parent: ${realWorkspace}`)
  }
  return realWorkspace
}
