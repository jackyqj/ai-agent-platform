import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertHostFlockAddon, flockAddonHint, hostFlockAddonPath } from './flock-addon.js'

test('resolves the darwin host addon under native/system/packages', () => {
  const path = hostFlockAddonPath('darwin', 'arm64')
  assert.equal(path?.endsWith('/native/system/packages/darwin-arm64/bin/system.node'), true)
})

test('resolves the linux glibc addon under a libc subdirectory', () => {
  const path = hostFlockAddonPath('linux', 'x64', 'glibc')
  assert.equal(path?.endsWith('/native/system/packages/linux-x64/bin/glibc/system.node'), true)
})

test('skips platforms that do not ship the POSIX flock addon', () => {
  assert.equal(hostFlockAddonPath('win32', 'arm64'), undefined)
})

test('assertHostFlockAddon explains how to build a missing addon', () => {
  const addonPath = hostFlockAddonPath()
  if (!addonPath) return
  assert.throws(
    () => assertHostFlockAddon(() => false),
    (err: Error) => {
      assert.equal(err.message, flockAddonHint(addonPath))
      return true
    },
  )
  assertHostFlockAddon(() => true)
})
