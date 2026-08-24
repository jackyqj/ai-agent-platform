import { ID_RE, type CatalogTool, type GraphSpec, type ValidationResult } from './types.js'

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

export function topoOrder(spec: GraphSpec): ValidationResult & { order?: string[] } {
  const ids = new Set(spec.nodes.map((n) => n.id))
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const id of ids) {
    indeg.set(id, 0)
    adj.set(id, [])
  }
  for (const e of spec.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) {
      return { ok: false, errors: [{ path: 'edges', message: `边引用未知节点 ${e.from}→${e.to}` }] }
    }
    adj.get(e.from)!.push(e.to)
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  }
  const q = [...ids].filter((id) => indeg.get(id) === 0)
  const order: string[] = []
  while (q.length) {
    const id = q.shift()!
    order.push(id)
    for (const nxt of adj.get(id) ?? []) {
      const n = (indeg.get(nxt) ?? 0) - 1
      indeg.set(nxt, n)
      if (n === 0) q.push(nxt)
    }
  }
  if (order.length !== ids.size) {
    return { ok: false, errors: [{ path: 'edges', message: '图中存在环，必须是 DAG' }] }
  }
  return { ok: true, order }
}

export function validateGraphSpec(
  spec: GraphSpec,
  ctx: { publishedAgentIds: Set<string>; publishedToolIds: Set<string> },
  opts?: { draft?: boolean },
): ValidationResult {
  const draft = opts?.draft === true
  const errors: Array<{ path: string; message: string }> = []
  if (spec.onError !== 'stop' && spec.onError !== 'continue') {
    errors.push({ path: 'onError', message: 'onError 必须是 stop | continue' })
  }
  if (!Array.isArray(spec.nodes) || (!draft && spec.nodes.length === 0)) {
    errors.push({ path: 'nodes', message: '至少需要一个节点' })
  }
  const seen = new Set<string>()
  for (let i = 0; i < (spec.nodes ?? []).length; i++) {
    const n = spec.nodes[i]
    const p = `nodes[${i}]`
    if (!ID_RE.test(n.id)) errors.push({ path: `${p}.id`, message: 'id 须匹配 [a-z0-9][a-z0-9-]*' })
    if (seen.has(n.id)) errors.push({ path: `${p}.id`, message: `重复节点 id：${n.id}` })
    seen.add(n.id)
    const kind = n.kind
    switch (kind) {
      case 'agent':
        if (!draft) {
          if (!n.agentPresetId) errors.push({ path: `${p}.agentPresetId`, message: 'agent 节点必须指定已发布 Agent' })
          else if (!ctx.publishedAgentIds.has(n.agentPresetId)) {
            errors.push({ path: `${p}.agentPresetId`, message: `Agent「${n.agentPresetId}」未发布或不存在` })
          }
          if (!n.promptTemplate?.trim()) errors.push({ path: `${p}.promptTemplate`, message: 'agent 节点必须有 promptTemplate' })
        }
        break
      case 'tool':
        if (!draft) {
          if (!n.toolId) errors.push({ path: `${p}.toolId`, message: 'tool 节点必须指定已发布工具' })
          else if (!ctx.publishedToolIds.has(n.toolId)) {
            errors.push({ path: `${p}.toolId`, message: `工具「${n.toolId}」未发布或不存在` })
          }
        }
        break
      case 'gate':
        if (!draft && !n.when?.trim()) errors.push({ path: `${p}.when`, message: 'gate 节点必须有 when 表达式' })
        break
      default: {
        const _k: never = kind
        errors.push({ path: `${p}.kind`, message: `未知节点类型：${String(_k)}` })
      }
    }
  }
  const topo = topoOrder({ ...spec, nodes: spec.nodes ?? [], edges: spec.edges ?? [] })
  if (!topo.ok) errors.push(...topo.errors)
  return errors.length ? { ok: false, errors } : { ok: true }
}

export function validateHttpPath(path: string): string | undefined {
  if (!path.startsWith('/')) return 'path 必须以 / 开头'
  if (path.includes('..') || path.includes('//')) return 'path 非法'
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return 'path 不能是绝对 URL'
  return undefined
}

export function validateToolBinding(tool: CatalogTool): ValidationResult {
  const errors: Array<{ path: string; message: string }> = []
  switch (tool.binding.kind) {
    case 'http':
      if (!HTTP_METHODS.has(tool.binding.method)) errors.push({ path: 'binding.method', message: '非法 HTTP method' })
      {
        const err = validateHttpPath(tool.binding.pathTemplate.split('{{')[0] || tool.binding.pathTemplate)
        if (err && !tool.binding.pathTemplate.includes('{{')) errors.push({ path: 'binding.pathTemplate', message: err })
        if (!tool.binding.pathTemplate.startsWith('/')) errors.push({ path: 'binding.pathTemplate', message: 'pathTemplate 必须以 / 开头' })
      }
      break
    case 'postgres':
      if (tool.binding.mode !== 'list_tables' && tool.binding.mode !== 'query_readonly') {
        errors.push({ path: 'binding.mode', message: 'postgres mode 必须是 list_tables | query_readonly' })
      }
      break
    default: {
      const _b: never = tool.binding
      errors.push({ path: 'binding.kind', message: `未知 binding：${String(_b)}` })
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true }
}
