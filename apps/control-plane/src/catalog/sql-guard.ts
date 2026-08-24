const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|grant|truncate|copy|call|execute|comment|vacuum|do|merge|lock)\b/i

export function assertReadonlySelect(sql: string, allowedTables: string[]): string | undefined {
  const trimmed = sql.trim()
  if (!/^select\b/i.test(trimmed)) return '只允许 SELECT 查询'
  if (trimmed.includes(';')) return '不支持多语句'
  if (FORBIDDEN.test(trimmed)) return '语句包含禁止的 SQL 关键字'
  const refs = [...trimmed.matchAll(/\b(?:from|join)\s+([a-zA-Z0-9_."]+)/gi)].map((m) => m[1].replace(/"/g, '').toLowerCase())
  if (refs.length === 0) return '未识别到 FROM/JOIN 表引用'
  const allow = new Set(allowedTables.map((t) => t.toLowerCase()))
  const bad = refs.filter((r) => !allow.has(r))
  if (bad.length > 0) return `引用了白名单外的表：${bad.join(', ')}`
  return undefined
}

export function ensureLimit(sql: string, maxRows: number): string {
  return /\blimit\b/i.test(sql) ? sql : `${sql} LIMIT ${maxRows}`
}
