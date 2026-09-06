import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { homedir } from 'node:os'

export function configPath(dshHome) {
  const home = dshHome || process.env.DSH_HOME || `${homedir()}/.dsh`
  return `${home.replace(/\/$/, '')}/.bienen-market.json`
}

/** Control-plane fetch failure with a stable panel/HTTP code. */
export class MarketRequestError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MarketRequestError'
    this.code = code
  }
}

const FETCH_MS = 10_000

export async function loadConfig(dshHome) {
  try {
    const raw = await readFile(configPath(dshHome), 'utf8')
    const j = JSON.parse(raw)
    if (!j.serverUrl || !j.token) return undefined
    return j
  } catch {
    return undefined
  }
}

export async function saveConfig(cfg, dshHome) {
  const path = configPath(dshHome ?? cfg.dshHome)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify({ serverUrl: cfg.serverUrl.replace(/\/$/, ''), token: cfg.token }, null, 2), { encoding: 'utf8', mode: 0o600 })
  return path
}

export async function api(cfg, path) {
  const url = `${cfg.serverUrl.replace(/\/$/, '')}${path}`
  let res
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(FETCH_MS),
    })
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    throw new MarketRequestError('unreachable', timedOut ? '控制面超时' : (e instanceof Error ? e.message : String(e)))
  }
  if (res.status === 401) throw new MarketRequestError('unauthorized', 'JWT 已失效，请重新 dsh-biene login')
  if (!res.ok) throw new MarketRequestError('unreachable', `${res.status} ${await res.text()}`)
  return res.json()
}
