import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { api } from './auth.js'
import { agentDir, parseSkillMeta, planSkillApply, skillPath } from './sync.js'

const ORIGIN = '.bienen-origin.json'

async function exists(fs, path) {
  try {
    await fs.readFile(path, 'utf8')
    return true
  } catch {
    return false
  }
}

/**
 * Pull published skills/agents and write them under $DSH_HOME.
 * @returns {Promise<string[]>} human-readable log lines
 */
export async function runSync(opts) {
  const cfg = opts.cfg
  const dshHome = opts.dshHome
  const force = Boolean(opts.force)
  const onlySkill = opts.onlySkill
  const onlyAgent = opts.onlyAgent
  const request = opts.request ?? api
  const fs = opts.fs ?? { mkdir, readFile, writeFile }
  const lines = []
  const wantSkills = !onlyAgent || Boolean(onlySkill)
  const wantAgents = !onlySkill || Boolean(onlyAgent)

  if (wantSkills) {
    const skills = await request(cfg, '/plugin/skills')
    const skillList = (skills.skills ?? []).filter((s) => !onlySkill || s.slug === onlySkill || s.id === onlySkill)
    lines.push(`可见 skill ${skillList.length} 个`)
    for (const s of skillList) {
      const md = await request(cfg, `/plugin/skills/${s.id}`)
      const dest = skillPath(dshHome, s.slug)
      let fileExists = false
      let meta = {}
      try {
        const cur = await fs.readFile(dest, 'utf8')
        fileExists = true
        meta = parseSkillMeta(cur)
      } catch { /* missing */ }
      const plan = planSkillApply({ exists: fileExists, meta }, { id: s.id, version: md.version })
      if (plan.action === 'conflict' && !force) {
        lines.push(`跳过 ${s.slug}：本地自建（无服务器版本号）。改名/加 --force 覆盖。`)
        continue
      }
      await fs.mkdir(dirname(dest), { recursive: true })
      await fs.writeFile(dest, md.markdown, 'utf8')
      lines.push(`${plan.action === 'write' ? '应用' : '更新'} ${s.slug}@${md.version}`)
    }
  }

  if (wantAgents) {
    const agents = await request(cfg, '/plugin/agents')
    const agentList = (agents.agents ?? []).filter((a) => !onlyAgent || a.id === onlyAgent)
    lines.push(`可见 agent ${agentList.length} 个`)
    for (const a of agentList) {
      const dir = agentDir(dshHome, a.id)
      const tracked = await exists(fs, `${dir}/${ORIGIN}`)
      const localPreset = await exists(fs, `${dir}/preset.yml`)
      if (localPreset && !tracked && !force) {
        lines.push(`跳过 agent ${a.id}：本地自建 preset。加 --force 覆盖。`)
        continue
      }
      const pack = await request(cfg, `/plugin/agents/${a.id}`)
      for (const [rel, content] of Object.entries(pack.files ?? {})) {
        const dest = `${dir}/${rel}`
        await fs.mkdir(dirname(dest), { recursive: true })
        await fs.writeFile(dest, content, 'utf8')
      }
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(`${dir}/${ORIGIN}`, JSON.stringify({ source: 'marketplace', id: a.id, version: pack.version }, null, 2), 'utf8')
      lines.push(`${tracked || localPreset ? '更新' : '应用'} agent ${a.id} v${pack.version} → ${dir}`)
    }
  }
  return lines
}
