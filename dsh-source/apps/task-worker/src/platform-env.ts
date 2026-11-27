import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** `apps/control-plane/.env` from this Worker module (`…/task-worker/src|dist/…`). */
export function resolvePlatformEnvPath(moduleUrl: string): string {
  return join(dirname(fileURLToPath(moduleUrl)), '../../../../apps/control-plane/.env')
}

/** Load control-plane .env without overriding a live shell. */
export function loadPlatformEnv(moduleUrl: string): void {
  const envPath = resolvePlatformEnvPath(moduleUrl)
  if (existsSync(envPath)) process.loadEnvFile(envPath)
}
