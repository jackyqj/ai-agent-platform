/**
 * query-tokenize.ts — 中英文查询分词（关键词回退检索用）
 */
export function tokenizeQuery(query: string): string[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const spaceTokens = trimmed.toLowerCase().split(/\s+/).filter((t) => t.length >= 2)
  if (spaceTokens.length > 1) return spaceTokens

  const tokens = new Set<string>()
  const compact = trimmed.replace(/\s+/g, '')

  // 英文/数字词
  for (const m of compact.match(/[a-z0-9]+/gi) ?? []) {
    if (m.length >= 2) tokens.add(m.toLowerCase())
  }

  // CJK bigrams + 完整 query（不用单字，避免误命中）
  const cjk = compact.replace(/[a-z0-9]/gi, '')
  for (let i = 0; i < cjk.length - 1; i++) {
    tokens.add(cjk.slice(i, i + 2))
  }
  if (cjk.length >= 3) tokens.add(cjk)

  // 保留空格分词结果
  for (const t of spaceTokens) tokens.add(t)

  return [...tokens]
}

export function scoreTextMatch(text: string, heading: string, tokens: string[]): number {
  const lower = text.toLowerCase()
  const headLower = heading.toLowerCase()
  let score = 0
  for (const t of tokens) {
    if (t.length < 2) continue
    if (lower.includes(t)) score += t.length * 10
    if (headLower.includes(t)) score += 15
    if (text.split('\n')[0]?.includes(t)) score += 5
  }
  return score
}
