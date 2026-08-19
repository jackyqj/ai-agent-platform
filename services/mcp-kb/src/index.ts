/**
 * company-mcp-kb — 公司内部知识库 MCP Server v0
 *
 * v0 能力：`knowledge_search` —— 对 docs/ 目录做关键词检索（简单匹配），
 * 返回命中文档片段与引用。17 工单升级为向量 RAG（pgvector + bge-m3）后，
 * 本工具的输入输出契约保持不变，仅替换实现。
 *
 * 传输（Phase 0 默认 stdio）：
 *   - 默认：stdio —— DSH `dsh-mcp-client` 以子进程方式拉起，内部单机首选
 *   - `--http`：streamable-http —— 多用户服务化（Phase 1+）升级路径；
 *     注：SDK 1.30.0 的 HTTP/SSE 路径在 Node 26 下响应挂起（见 README "已知问题"），
 *     升级路径需在 SDK 修复或更换运行时后启用
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

import { createServer } from 'node:http'
import { readdir, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { embed } from './embedding.js'
import { loadIndex, searchTopK } from './vector-index.js'

const DOCS_ROOT = process.env.KB_DOCS_ROOT ?? fileURLToPath(new URL('../docs', import.meta.url))
const PORT = Number(process.env.KB_PORT ?? 8787)
const INDEX_PATH = process.env.KB_INDEX_PATH ?? fileURLToPath(new URL('../data/index.json', import.meta.url))
const TOKEN = process.env.KB_TOKEN ?? '' // --http 模式的简单鉴权

const TEXT_EXT = new Set(['.md', '.txt', '.markdown'])

async function listDocs(): Promise<{ path: string; text: string }[]> {
  const out: { path: string; text: string }[] = []
  for (const name of await readdir(DOCS_ROOT)) {
    const full = join(DOCS_ROOT, name)
    if (!TEXT_EXT.has(extname(name))) continue
    try {
      out.push({ path: name, text: await readFile(full, 'utf8') })
    } catch {
      // 跳过不可读文件
    }
  }
  return out
}

function rankDocs(docs: { path: string; text: string }[], query: string, limit: number) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const scored = docs
    .map((doc) => {
      const lower = doc.text.toLowerCase()
      let score = 0
      for (const t of tokens) {
        const idx = lower.indexOf(t)
        if (idx >= 0) {
          score += t.length * 10
          if (doc.text.split('\n')[0].toLowerCase().includes(t)) score += 5 // 标题命中加权
        }
      }
      let snippet = ''
      const first = tokens.map((t) => lower.indexOf(t)).find((i) => i >= 0)
      if (first !== undefined) {
        const start = Math.max(0, first - 60)
        snippet = doc.text.slice(start, first + 180).replace(/\n+/g, ' ').trim()
      }
      return { path: doc.path, score, snippet }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  return scored
}

const server = new McpServer(
  { name: 'company-kb', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.registerTool(
  'knowledge_search',
  {
    title: '知识库检索',
    description:
      '在公司内部知识库检索制度/FAQ 文档，返回命中的文档、章节与摘要片段。' +
      '优先语义检索（向量，理解"报销能报多少"这类问法）；向量索引未建立时回退关键词匹配。' +
      '检索不到时建议换个说法或人工确认文档是否已入库。',
    inputSchema: {
      query: z.string().describe('检索问题，如「出差交通费能报多少」'),
      limit: z.number().int().min(1).max(10).optional().describe('返回条数上限，默认 5'),
    },
  },
  async ({ query, limit }: { query: string; limit?: number }) => {
    const k = limit ?? 5
    // 1) 向量检索（有索引时）
    const index = await loadIndex(INDEX_PATH)
    if (index) {
      try {
        const [queryVec] = await embed([query], 'query')
        const hits = searchTopK(index, queryVec, k)
        if (hits.length > 0) {
          const text = hits
            .map((h, i) => `【${h.chunk.source}｜${h.chunk.heading}】(相似度 ${h.score.toFixed(3)})\n  ${h.chunk.text.slice(0, 300)}`)
            .join('\n\n')
          return {
            content: [{ type: 'text' as const, text: `语义检索命中（${hits.length} 条，索引 ${index.chunks.length} 切片）：\n\n${text}` }],
          }
        }
      } catch (e) {
        console.error('[kb] vector search failed, falling back to keyword:', (e as Error).message)
      }
    }
    // 2) 关键词回退
    const docs = await listDocs()
    const hits = rankDocs(docs, query, k)
    if (hits.length === 0) {
      return {
        content: [{ type: 'text' as const, text: `知识库中未找到与「${query}」匹配的文档（共 ${docs.length} 篇已入库${index ? `，向量索引 ${index.chunks.length} 切片` : ''}）。` }],
      }
    }
    const text = hits
      .map((h) => `【${h.path}】(相关度 ${h.score})\n  ${h.snippet || '(无摘要)'}`)
      .join('\n\n')
    return { content: [{ type: 'text' as const, text: `关键词检索命中：\n\n${text}` }] }
  },
)

// ── 传输选择 ───────────────────────────────────────────────────────────────
const useHttp = process.argv.includes('--http')

if (useHttp) {
  // streamable-http（Phase 1+ 服务化升级路径；SDK HTTP 路径在 Node 26 下暂不可用，见 README）
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  const httpServer = createServer(async (req, res) => {
    if (TOKEN) {
      const auth = req.headers.authorization
      if (auth !== `Bearer ${TOKEN}`) {
        res.writeHead(401).end('unauthorized')
        return
      }
    }
    if (req.method === 'POST' && req.url === '/mcp') {
      await transport.handleRequest(req, res)
      return
    }
    res.writeHead(405, { Allow: 'POST' }).end('method not allowed (use POST /mcp)')
  })
  httpServer.listen(PORT, () => {
    console.log(`[company-mcp-kb] streamable-http listening on http://127.0.0.1:${PORT}/mcp`)
  })
} else {
  // stdio（Phase 0 默认）：DSH dsh-mcp-client 以子进程拉起，无需端口/鉴权头
  await server.connect(new StdioServerTransport())
  console.error('[company-mcp-kb] stdio mode, docs: ' + DOCS_ROOT)
}
