import assert from 'node:assert/strict'
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import {
  ensureSessionWorkspace,
  resolveSessionRoot,
  resolveSessionWorkspace,
  resolveWorkspacesParent,
} from './workspace.js'

const moduleUrl = pathToFileURL(join('/tmp/task-worker/src/worker.ts')).href

test('session root defaults beside the worker app, not the shared sandbox', () => {
  assert.equal(resolveSessionRoot(moduleUrl), '/tmp/task-worker/.sessions-worker')
})

test('relative DSH_SESSION_ROOT resolves against the worker app dir', () => {
  assert.equal(resolveSessionRoot(moduleUrl, './logs'), '/tmp/task-worker/logs')
})

test('absolute DSH_SESSION_ROOT wins', () => {
  assert.equal(resolveSessionRoot(moduleUrl, '/var/sessions'), '/var/sessions')
})

test('workspaces parent defaults under the JSONL root', () => {
  assert.equal(
    resolveWorkspacesParent('/tmp/task-worker/.sessions-worker'),
    '/tmp/task-worker/.sessions-worker/workspaces',
  )
})

test('DSH_CWD overrides the workspaces parent, not the writable leaf', () => {
  assert.equal(resolveWorkspacesParent('/tmp/task-worker/.sessions-worker', '/var/agent-cwd'), '/var/agent-cwd')
})

test('session workspace is nested as <parent>/<id>/cwd to sit below the JSONL session slot', () => {
  assert.equal(
    resolveSessionWorkspace('/tmp/task-worker/.sessions-worker/workspaces', 'sess-abc'),
    '/tmp/task-worker/.sessions-worker/workspaces/sess-abc/cwd',
  )
})

test('ids that start with dots but are not . or .. stay under the parent', () => {
  const parent = '/tmp/task-worker/.sessions-worker/workspaces'
  assert.equal(resolveSessionWorkspace(parent, '..foo'), join(parent, '..foo', 'cwd'))
})

test('rejects session ids that can traverse or collide with path segments', () => {
  const parent = '/tmp/task-worker/.sessions-worker/workspaces'
  assert.throws(() => resolveSessionWorkspace(parent, ''), /session id/)
  assert.throws(() => resolveSessionWorkspace(parent, '.'), /session id/)
  assert.throws(() => resolveSessionWorkspace(parent, '..'), /session id/)
  assert.throws(() => resolveSessionWorkspace(parent, '../x'), /session id/)
  assert.throws(() => resolveSessionWorkspace(parent, 'a/b'), /session id/)
  assert.throws(() => resolveSessionWorkspace(parent, 'a\\b'), /session id/)
})

test('creates the nested session workspace and keeps it inside the parent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'task-worker-ws-'))
  const parent = join(root, 'workspaces')
  try {
    const workspace = ensureSessionWorkspace(parent, '99eb7a40-2f3b-43a8-abef-29404944a65b')
    assert.equal(workspace, await realpath(join(parent, '99eb7a40-2f3b-43a8-abef-29404944a65b', 'cwd')))
    const dotted = ensureSessionWorkspace(parent, '..foo')
    assert.equal(dotted, await realpath(join(parent, '..foo', 'cwd')))
    ensureSessionWorkspace(parent, '99eb7a40-2f3b-43a8-abef-29404944a65b')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('refuses a workspace whose realpath escaped the parent', () => {
  const root = mkdtempSyncSafe()
  const parent = join(root, 'workspaces')
  const outside = join(root, 'outside')
  mkdirSync(outside, { recursive: true })
  mkdirSync(parent, { recursive: true })
  const slot = join(parent, 'sess-link')
  mkdirSync(slot, { recursive: true })
  symlinkSync(outside, join(slot, 'cwd'))
  try {
    assert.throws(() => ensureSessionWorkspace(parent, 'sess-link'), /escaped/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

function mkdtempSyncSafe(): string {
  const dir = join(tmpdir(), `task-worker-ws-${process.pid}-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '.keep'), '')
  return dir
}
