import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { resolvePlatformEnvPath } from './platform-env.ts'

test('platform env is the control-plane .env at the repo root, not one directory above it', () => {
  const moduleUrl = pathToFileURL('/Users/jac/sw_dir/ai-agent-platform/dsh-source/apps/task-worker/src/worker.ts').href
  assert.equal(
    resolvePlatformEnvPath(moduleUrl),
    '/Users/jac/sw_dir/ai-agent-platform/apps/control-plane/.env',
  )
})
