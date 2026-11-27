import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** JSONL/SQLite session leases load this host addon; binaries are gitignored. */
export function hostFlockAddonPath(
  platform = process.platform,
  arch = process.arch,
  linuxLibc?: 'glibc' | 'musl',
): string | undefined {
  if (platform !== 'darwin' && platform !== 'linux') return undefined
  const packages = fileURLToPath(new URL('../../../native/system/packages/', import.meta.url))
  const filename = platform === 'linux' ? join(linuxLibc ?? 'glibc', 'system.node') : 'system.node'
  return join(packages, `${platform}-${arch}`, 'bin', filename)
}

export function flockAddonHint(addonPath: string): string {
  return `DSH flock addon missing at ${addonPath}. From dsh-source run: pnpm run build:native-system`
}

export function assertHostFlockAddon(exists: (path: string) => boolean = existsSync): void {
  const addonPath = hostFlockAddonPath()
  if (!addonPath) return
  if (!exists(addonPath)) throw new Error(flockAddonHint(addonPath))
}
