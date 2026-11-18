import { readFile } from 'node:fs/promises'
import { MarketRequestError } from './auth.js'
import { agentDir, catalogState, parseSkillMeta, skillPath } from './sync.js'

const UNSIGNED_MESSAGE = '未登录。先在终端运行 dsh-biene login --server <URL> --token <JWT>'

async function readText(fs, path) {
  try {
    return await fs.readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

function classifyError(e) {
  if (e instanceof MarketRequestError) return { code: e.code, message: e.message }
  return { code: 'internal', message: e instanceof Error ? e.message : String(e) }
}

async function skillRow(fs, dshHome, remote) {
  const text = await readText(fs, skillPath(dshHome, remote.slug))
  const meta = text === undefined ? {} : parseSkillMeta(text)
  const state = catalogState({ exists: text !== undefined, meta }, { id: remote.id, version: String(remote.version) })
  return {
    id: remote.id,
    slug: remote.slug,
    title: remote.title ?? remote.slug,
    localVersion: meta.version ?? null,
    remoteVersion: String(remote.version),
    state,
  }
}

async function agentRow(fs, dshHome, remote) {
  const dir = agentDir(dshHome, remote.id)
  const preset = await readText(fs, `${dir}/preset.yml`)
  const originRaw = await readText(fs, `${dir}/.bienen-origin.json`)
  let origin
  if (originRaw !== undefined) {
    try { origin = JSON.parse(originRaw) } catch { origin = undefined }
  }
  const meta = origin?.id
    ? { skill_id: origin.id, version: String(origin.version) }
    : {}
  const state = catalogState(
    { exists: preset !== undefined, meta },
    { id: remote.id, version: String(remote.version) },
  )
  return {
    id: remote.id,
    title: remote.name ?? remote.title ?? null,
    localVersion: origin ? String(origin.version) : null,
    remoteVersion: String(remote.version),
    state,
  }
}

/** Compare the published catalog to $DSH_HOME without writing. */
export async function buildStatus(opts) {
  const load = opts.loadConfig
  const request = opts.request
  const fs = opts.fs ?? { readFile }
  const dshHome = opts.dshHome
  const cfg = await load(dshHome)
  if (!cfg) {
    return {
      loggedIn: false,
      error: { code: 'unauthenticated', message: UNSIGNED_MESSAGE },
      skills: [],
      agents: [],
    }
  }
  try {
    const skillsRes = await request(cfg, '/plugin/skills')
    const agentsRes = await request(cfg, '/plugin/agents')
    const skills = []
    for (const s of skillsRes.skills ?? []) skills.push(await skillRow(fs, dshHome, s))
    const agents = []
    for (const a of agentsRes.agents ?? []) agents.push(await agentRow(fs, dshHome, a))
    return { loggedIn: true, serverUrl: cfg.serverUrl, skills, agents }
  } catch (e) {
    return { loggedIn: true, serverUrl: cfg.serverUrl, error: classifyError(e), skills: [], agents: [] }
  }
}

function actionable(item, filtered) {
  if (item.state === 'conflict') return 'skip'
  if (!filtered && item.state === 'current') return 'skip-current'
  return 'apply'
}

/** Apply non-conflict catalog items. Never honors force. */
export async function applyMarket(opts) {
  const load = opts.loadConfig
  const request = opts.request
  const sync = opts.runSync
  const dshHome = opts.dshHome
  const snap = await buildStatus(opts)
  if (snap.error?.code === 'unauthenticated') {
    return { httpStatus: 401, body: snap }
  }
  const applied = []
  const skipped = []
  const failed = []
  if (snap.error) {
    return { httpStatus: 200, body: { ...snap, applied, skipped, failed } }
  }
  const cfg = await load(dshHome)
  const wantSkill = opts.skill
  const wantAgent = opts.agent
  const filtered = Boolean(wantSkill || wantAgent)
  for (const s of snap.skills) {
    if (wantAgent && !wantSkill) continue
    if (wantSkill && s.slug !== wantSkill && s.id !== wantSkill) continue
    const act = actionable(s, filtered)
    if (act !== 'apply') {
      if (act === 'skip') skipped.push(s.slug)
      continue
    }
    try {
      await sync({ cfg, dshHome, force: false, request, onlySkill: s.slug })
      applied.push(s.slug)
    } catch (e) {
      failed.push({ id: s.slug, message: e instanceof Error ? e.message : String(e) })
    }
  }
  for (const a of snap.agents) {
    if (wantSkill && !wantAgent) continue
    if (wantAgent && a.id !== wantAgent) continue
    const act = actionable(a, filtered)
    if (act !== 'apply') {
      if (act === 'skip') skipped.push(a.id)
      continue
    }
    try {
      await sync({ cfg, dshHome, force: false, request, onlyAgent: a.id })
      applied.push(a.id)
    } catch (e) {
      failed.push({ id: a.id, message: e instanceof Error ? e.message : String(e) })
    }
  }
  const after = await buildStatus(opts)
  return { httpStatus: 200, body: { ...after, applied, skipped, failed } }
}
