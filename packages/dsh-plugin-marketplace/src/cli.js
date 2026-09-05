#!/usr/bin/env node
import { homedir } from 'node:os'
import { api, loadConfig, saveConfig } from './auth.js'
import { runSync } from './apply.js'

function home() {
  return process.env.DSH_HOME || `${homedir()}/.dsh`
}

async function requireCfg() {
  const cfg = await loadConfig()
  if (!cfg) throw new Error('未登录。先运行：dsh-biene login --server <控制面URL> --token <JWT>')
  return cfg
}

async function login(args) {
  const server = flag(args, '--server') || 'http://127.0.0.1:4000/api'
  const token = flag(args, '--token')
  const devUser = flag(args, '--dev-user')
  let jwt = token
  if (!jwt && devUser) {
    const url = `${server.replace(/\/$/, '')}/auth/dev/login?userId=${encodeURIComponent(devUser)}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`dev login 失败 ${res.status}`)
    const body = await res.json()
    jwt = body.accessToken
  }
  if (!jwt) {
    console.log('钉钉 SSO：浏览器打开')
    console.log(`  ${server.replace(/\/api$/, '')}/api/auth/sso/login`)
    console.log('登录后从跳转 URL 的 #token= 复制 JWT，再执行：')
    console.log(`  dsh-biene login --server ${server} --token <JWT>`)
    return
  }
  const path = await saveConfig({ serverUrl: server, token: jwt })
  console.log('已保存', path)
}

function flag(args, name) {
  const i = args.indexOf(name)
  if (i < 0) return undefined
  return args[i + 1]
}

export const HELP = `dsh-biene — 小彼恩 skill/agent 同步（打进现有 dsh，不改标题）

  dsh-biene login --server http://<cp>/api --token <JWT>
  dsh-biene login --server http://127.0.0.1:4000/api --dev-user u-admin
  dsh-biene sync [--force] [--skill <slug>] [--agent <id>]

安装进 dsh profile（员工现有 web / company 均可）：
  dsh plugin --profile web add /path/to/packages/dsh-plugin-marketplace

插件加载后也可在 dsh web 聊天框输入 /biene sync
`

async function main() {
  const argv = process.argv.slice(2)
  const cmd = argv[0]
  switch (cmd) {
    case 'login':
      await login(argv.slice(1))
      return
    case 'sync':
    case 'market': {
      const cfg = await requireCfg()
      const lines = await runSync({
        cfg, dshHome: home(), force: argv.includes('--force'), request: api,
        onlySkill: flag(argv, '--skill'),
        onlyAgent: flag(argv, '--agent'),
      })
      for (const line of lines) console.log(line)
      return
    }
    case 'help':
    case undefined:
      console.log(HELP)
      return
    default:
      throw new Error(`未知命令 ${cmd}，见 dsh-biene help`)
  }
}

const isCli = process.argv[1] && process.argv[1].endsWith('cli.js')
if (isCli) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
