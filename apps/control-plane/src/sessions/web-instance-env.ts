/** Env injected into interactive DSH web instances. No vault master key, no JWT secret. */
export function webInstanceEnv(
  permissionMode: string,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const pg = env.DATABASE_URL ?? env.PG_DSN ?? ''
  const port = env.CP_PORT ?? '4000'
  return {
    DEEPSEEK_BASE_URL: env.DEEPSEEK_BASE_URL ?? '',
    CP_TRUSTED_HOST: '127.0.0.1',
    DSH_HOME: '/dsh-home',
    DATABASE_URL: pg,
    PG_DSN: pg,
    SESSION_PG_URL: env.SESSION_PG_URL ?? pg,
    CP_SECRETS_URL: env.CP_SECRETS_URL ?? `http://127.0.0.1:${port}/api/internal/secrets`,
    CP_SECRETS_TOKEN: env.CP_SECRETS_TOKEN ?? '',
    DSH_PERMISSION_MODE: permissionMode,
  }
}
