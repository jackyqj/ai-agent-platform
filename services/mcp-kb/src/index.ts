/**
 * company-mcp-kb — 公司内部知识库 MCP Server v1
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { knowledgeSearch } from './search.js'
import type { UserContext } from './permissions.js'

const DOCS_ROOT = process.env.KB_DOCS_ROOT ?? fileURLToPath(new URL('../docs', import.meta.url))
const PORT = Number(process.env.KB_PORT ?? 8787)
const INDEX_PATH = process.env.KB_INDEX_PATH ?? fileURLToPath(new URL('../data/index.json', import.meta.url))
const TOKEN = process.env.KB_TOKEN ?? ''

const userContextSchema = z.object({
  userId: z.string().optional().describe('用户 ID'),
  departments: z.array(z.string()).optional().describe('用户所属部门，如 ["sales", "HR"]'),
  roles: z.array(z.string()).optional().describe('用户角色，如 ["employee", "sales-admin"]'),
}).optional()

function formatHits(result: Awaited<ReturnType<typeof knowledgeSearch>>) {
  if (result.denied) {
    return '找到相关内容，但当前用户无权限访问。请确认 user.departments / user.roles 是否正确传入。'
  }
  if (result.hits.length === 0) {
    const permHint = result.mode === 'none' ? '（未传 user 上下文时仅可检索 public 文档）' : ''
    return `知识库中未找到匹配且有权限的文档（共 ${result.totalDocs} 篇已入库${result.indexChunks ? `，向量索引 ${result.indexChunks} 切片` : ''}）${permHint}。`
  }
  const label = result.mode === 'vector' ? '语义检索命中' : '关键词检索命中'
  const body = result.hits
    .map((h) => {
      const scoreLabel = h.rerankScore !== undefined
        ? `重排 ${h.rerankScore.toFixed(3)}（向量 ${h.score.toFixed(3)}）`
        : h.mode === 'vector'
          ? `相似度 ${h.score.toFixed(3)}`
          : `相关度 ${h.score}`
      return `【${h.source}｜${h.heading}】(${scoreLabel})\n  ${h.snippet || '(无摘要)'}`
    })
    .join('\n\n')
  const prefix = result.mode === 'vector'
    ? `${label}（${result.hits.length} 条，索引 ${result.indexChunks} 切片）`
    : label
  return `${prefix}：\n\n${body}`
}

const server = new McpServer(
  { name: 'company-kb', version: '0.3.0' },
  { capabilities: { tools: {} } },
)

server.registerTool(
  'knowledge_search',
  {
    title: '知识库检索',
    description:
      '在公司内部知识库检索制度/FAQ/业务文档（支持 Markdown/PDF/Word），返回命中的文档、章节与摘要片段（含引用出处）。' +
      '优先语义检索 + 重排；索引缺失时回退关键词匹配。' +
      '传入 user 上下文（departments/roles）以按权限过滤；无权限的文档不会返回。',
    inputSchema: {
      query: z.string().describe('检索问题，如「出差交通费能报多少」'),
      limit: z.number().int().min(1).max(10).optional().describe('返回条数上限，默认 5'),
      user: userContextSchema.describe('当前用户上下文（部门/角色），用于权限过滤'),
    },
  },
  async ({ query, limit, user }: { query: string; limit?: number; user?: UserContext }) => {
    const result = await knowledgeSearch({ docsRoot: DOCS_ROOT, indexPath: INDEX_PATH, query, limit, user })
    return { content: [{ type: 'text' as const, text: formatHits(result) }] }
  },
)

const useHttp = process.argv.includes('--http')

if (useHttp) {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await server.connect(transport)
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
  await server.connect(new StdioServerTransport())
  console.error('[company-mcp-kb] stdio mode, docs: ' + DOCS_ROOT)
}
