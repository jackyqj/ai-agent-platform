import { homedir } from 'node:os'
import { loadConfig } from './auth.js'
import { runSync } from './apply.js'

/** Host-plane bundle entry. CLI lives in ./cli.js (`dsh-biene`). */
export const name = 'bienen-market'
export const inject = ['commands']

function dshHome() {
  return process.env.DSH_HOME || `${homedir()}/.dsh`
}

export async function handleBieneCommand(rawInput, deps = {}) {
  const raw = (rawInput ?? '').trim()
  const load = deps.loadConfig ?? loadConfig
  const sync = deps.runSync ?? runSync
  if (!raw || raw === 'help' || raw.startsWith('login')) {
    return {
      kind: 'success',
      text: '终端登录：dsh-biene login --server <控制面URL>/api --token <JWT>\n同步：/biene sync [--force] [--skill <slug>] [--agent <id>]',
    }
  }
  const force = /\b--force\b/.test(raw)
  const parts = raw.split(/\s+/)
  const flagVal = (name) => {
    const i = parts.indexOf(name)
    return i >= 0 ? parts[i + 1] : undefined
  }
  const cfg = await load()
  if (!cfg) {
    return { kind: 'error', text: '未登录。先在终端运行 dsh-biene login --server <URL> --token <JWT>' }
  }
  try {
    const lines = await sync({
      cfg, dshHome: dshHome(), force,
      onlySkill: flagVal('--skill'),
      onlyAgent: flagVal('--agent'),
    })
    return { kind: 'success', text: lines.join('\n') }
  } catch (e) {
    return { kind: 'error', text: e instanceof Error ? e.message : String(e) }
  }
}

/** Register `/biene` so the web sidebar command palette can sync without leaving dsh. */
export function apply(ctx) {
  ctx.commands.register({
    name: 'biene',
    description: '同步小彼恩已发布 skill / agent 到本机',
    input: { hint: 'sync [--force]' },
    handler: (invocation) => handleBieneCommand(invocation.rawInput),
  })
}
