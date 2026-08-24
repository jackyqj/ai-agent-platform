export function getPath(root: unknown, path: string): unknown {
  let cur: unknown = root
  for (const part of path.split('.').map((s) => s.trim()).filter(Boolean)) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

export function interpolate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, raw: string) => {
    const v = getPath(ctx, raw.trim())
    if (v === undefined || v === null) return ''
    return typeof v === 'string' ? v : JSON.stringify(v)
  })
}

export function interpolateArgs(args: Record<string, string> | undefined, ctx: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(args ?? {})) {
    out[k] = interpolate(v, ctx)
  }
  return out
}
