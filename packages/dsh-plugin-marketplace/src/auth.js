import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { homedir } from 'node:os'

export function configPath(dshHome) {
  const home = dshHome || process.env.DSH_HOME || `${homedir()}/.dsh`
  return `${home.replace(/\/$/, '')}/.bienen-market.json`
}

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
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.token}` } })
  if (res.status === 401) throw new Error('JWT 已失效，请重新 dsh-biene login')
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}
