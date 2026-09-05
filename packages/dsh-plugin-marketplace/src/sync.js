/** Conflict + apply rules for marketplace skill/agent files (issue 24 Q17). */

export function planSkillApply(local, remote) {
  if (!local.exists) return { action: 'write' }
  const sid = local.meta?.skill_id
  if (!sid) return { action: 'conflict', reason: 'local-untracked' }
  if (sid !== remote.id) return { action: 'conflict', reason: 'other-server-id' }
  return { action: 'overwrite', from: local.meta?.version, to: remote.version }
}

export function parseSkillMeta(markdown) {
  const m = markdown.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const block = m[1] ?? ''
  const id = block.match(/skill_id["']?\s*[:=]\s*["']?([^\s"',}]+)/)?.[1]
  const version = block.match(/version["']?\s*[:=]\s*["']?([0-9]+\.[0-9]+\.[0-9]+)/)?.[1]
  return { skill_id: id, version }
}

export function skillPath(home, slug) {
  return `${home.replace(/\/$/, '')}/skills/${slug}/SKILL.md`
}

export function agentDir(home, id) {
  return `${home.replace(/\/$/, '')}/.agent-presets/${id}`
}
