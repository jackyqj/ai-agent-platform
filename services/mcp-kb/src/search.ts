/**
 * search.ts — 知识库检索核心（向量 + 重排 + 关键词回退 + 权限过滤）
 * 供 MCP 工具与 eval 脚本共用。
 */
import { embed } from './embedding.js'
import { listAndParseDocs } from './doc-sources.js'
import { canAccess, loadManifest, resolveVisibility, type UserContext } from './permissions.js'
import { scoreTextMatch, tokenizeQuery } from './query-tokenize.js'
import { loadIndex, rerank, searchTopK } from './vector-index.js'

export interface SearchHit {
  source: string
  heading: string
  snippet: string
  score: number
  rerankScore?: number
  mode: 'vector' | 'keyword'
}

export interface SearchOptions {
  docsRoot: string
  indexPath: string
  query: string
  limit?: number
  user?: UserContext
}

export interface SearchResult {
  hits: SearchHit[]
  mode: 'vector' | 'keyword' | 'none'
  denied?: boolean
  totalDocs: number
  indexChunks?: number
}

function rankDocsKeyword(
  docs: { path: string; text: string }[],
  query: string,
  limit: number,
  user: UserContext | undefined,
  manifest: Awaited<ReturnType<typeof loadManifest>>,
): SearchHit[] {
  const tokens = tokenizeQuery(query)
  return docs
    .filter((doc) => canAccess(resolveVisibility(manifest, doc.path), user))
    .map((doc) => {
      const score = scoreTextMatch(doc.text, doc.path, tokens)
      let snippet = ''
      const lower = doc.text.toLowerCase()
      const first = tokens.map((t) => lower.indexOf(t.toLowerCase())).find((i) => i >= 0)
      if (first !== undefined && first >= 0) {
        const start = Math.max(0, first - 60)
        snippet = doc.text.slice(start, first + 180).replace(/\n+/g, ' ').trim()
      }
      return { source: doc.path, heading: '(全文)', snippet, score, mode: 'keyword' as const }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export async function knowledgeSearch(opts: SearchOptions): Promise<SearchResult> {
  const k = opts.limit ?? 5
  const manifest = await loadManifest(opts.docsRoot)
  const docs = await listAndParseDocs(opts.docsRoot)
  const index = await loadIndex(opts.indexPath)

  if (index) {
    try {
      const [queryVec] = await embed([opts.query], 'query')
      const recallK = Math.min(k * 3, index.chunks.length)
      const allCandidates = searchTopK(index, queryVec, recallK)
      const candidates = allCandidates.filter(({ chunk }) =>
        canAccess(chunk.visibility ?? resolveVisibility(manifest, chunk.source), opts.user),
      )
      const hits = rerank(candidates, opts.query, k)
      if (hits.length > 0) {
        return {
          hits: hits.map((h) => ({
            source: h.chunk.source,
            heading: h.chunk.heading,
            snippet: h.chunk.text.slice(0, 300),
            score: h.score,
            rerankScore: h.rerankScore,
            mode: 'vector',
          })),
          mode: 'vector',
          totalDocs: docs.length,
          indexChunks: index.chunks.length,
        }
      }
      if (allCandidates.length > 0 && candidates.length === 0) {
        return { hits: [], mode: 'none', denied: true, totalDocs: docs.length, indexChunks: index.chunks.length }
      }
    } catch {
      // fall through to keyword
    }
  }

  const kwHits = rankDocsKeyword(docs, opts.query, k, opts.user, manifest)
  return {
    hits: kwHits,
    mode: kwHits.length > 0 ? 'keyword' : 'none',
    totalDocs: docs.length,
    indexChunks: index?.chunks.length,
  }
}

/** Top-k 是否命中期望来源之一 */
export function hitInTopK(hits: SearchHit[], expectedSources: string[], k = 5): boolean {
  const top = hits.slice(0, k).map((h) => h.source)
  return expectedSources.some((s) => top.includes(s))
}
