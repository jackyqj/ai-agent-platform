import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Load apps/control-plane/.env if present; do not override already-set env vars. */
const envPath = join(process.cwd(), '.env')
if (existsSync(envPath)) {
  process.loadEnvFile(envPath)
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    process.env.PG_DSN ?? 'postgres://adaptix:adaptix_password@127.0.0.1:5432/control_plane'
}
