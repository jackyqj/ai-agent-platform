import { runSync } from './apply.js'
import { applyMarket, buildStatus } from './status.js'

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))).toString('utf8').trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch { /* invalid JSON */ }
  return {}
}

function send(res, status, body) {
  const json = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(json)
}

/** Host HTTP handlers for the sidebar panel. Force is ignored. */
export function createMarketHandlers(deps) {
  const bind = {
    dshHome: deps.dshHome,
    loadConfig: deps.loadConfig,
    request: deps.request,
    fs: deps.fs,
    runSync: deps.runSync ?? runSync,
  }
  return {
    async status(_req, res) {
      send(res, 200, await buildStatus(bind))
    },
    async apply(req, res) {
      const body = await readJson(req)
      const result = await applyMarket({
        ...bind,
        skill: typeof body.skill === 'string' ? body.skill : undefined,
        agent: typeof body.agent === 'string' ? body.agent : undefined,
      })
      send(res, result.httpStatus, result.body)
    },
  }
}
