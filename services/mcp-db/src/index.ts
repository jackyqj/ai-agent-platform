/**
 * company-mcp-db — 公司只读数据库 MCP Server（试点「数据查询报表」场景）
 *
 * 安全设计（v1，防御纵深）：
 *   1. 连接级只读：default_transaction_read_only=on（PostgreSQL 服务器强制，写操作直接报错）
 *   2. 语句级校验：必须以 SELECT 开头、单语句、禁止 DML/DDL/危险关键词
 *   3. 表白名单：仅允许配置的 schema.table（DB_ALLOWED_TABLES），缺省拒绝一切（fail-closed）
 *   4. 上限：自动追加 LIMIT（缺省 50）、客户端截断 50 行、statement_timeout 10s
 * 审批位预留：敏感查询（跨部门大表等）的审批由 14 工单的授权存储承接，本工具 v1 不内置。
 *
 * 传输：stdio（Phase 0 模式，DSH 拉起子进程）。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import pg from 'pg'
import { fileURLToPath } from 'node:url'

const DATABASE_URL = process.env.DB_DSN ?? 'postgres://adaptix:adaptix_password@127.0.0.1:5432/control_plane'
const ALLOWED_TABLES = (process.env.DB_ALLOWED_TABLES ?? 'demo_sales.regions,demo_sales.products,demo_sales.orders')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
const MAX_ROWS = Number(process.env.DB_MAX_ROWS ?? 50)
const MAX_CHARS = Number(process.env.DB_MAX_CHARS ?? 20000)

/** 只读连接：服务器端强制 read-only + 语句超时（防御纵深的最后一道） */
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  options: '-c default_transaction_read_only=on -c statement_timeout=10000',
})

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|grant|truncate|copy|call|execute|comment|vacuum|do|merge|lock)\b/i

function isAllowedQuery(sql: string): string | undefined {
  const trimmed = sql.trim()
  if (!/^select\b/i.test(trimmed)) return '只允许 SELECT 查询'
  if (trimmed.includes(';')) return '不支持多语句'
  if (FORBIDDEN.test(trimmed)) return '语句包含禁止的 SQL 关键字'
  // 提取 FROM/JOIN 引用的表名（粗解析；连接级只读是兜底）
  const refs = [...trimmed.matchAll(/\b(?:from|join)\s+([a-zA-Z0-9_."]+)/gi)].map((m) => m[1].replace(/"/g, '').toLowerCase())
  if (refs.length === 0) return '未识别到 FROM/JOIN 表引用'
  const bad = refs.filter((r) => !ALLOWED_TABLES.includes(r))
  if (bad.length > 0) return `引用了白名单外的表：${bad.join(', ')}（白名单：${ALLOWED_TABLES.join(', ')}）`
  return undefined
}

function ensureLimit(sql: string): string {
  return /\blimit\b/i.test(sql) ? sql : `${sql} LIMIT ${MAX_ROWS}`
}

async function describeTables(): Promise<string> {
  const { rows } = await pool.query(
    `SELECT table_schema, table_name, column_name, data_type
     FROM information_schema.columns
     WHERE lower(table_schema || '.' || table_name) = ANY($1)
     ORDER BY table_schema, table_name, ordinal_position`,
    [ALLOWED_TABLES],
  )
  const byTable = new Map<string, string[]>()
  for (const r of rows) {
    const key = `${r.table_schema}.${r.table_name}`
    byTable.set(key, [...(byTable.get(key) ?? []), `${r.column_name}:${r.data_type}`])
  }
  return [...byTable.entries()].map(([t, cols]) => `- ${t}\n    ${cols.join(', ')}`).join('\n')
}

function fmtRows(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '(0 行)'
  const cols = Object.keys(rows[0])
  const pad = (s: string, w: number) => s.padEnd(w).slice(0, w)
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)))
  const head = cols.map((c, i) => pad(c, widths[i])).join(' | ')
  const sep = widths.map((w) => '-'.repeat(w)).join('-+-')
  const body = rows.map((r) => cols.map((c, i) => pad(String(r[c] ?? ''), widths[i])).join(' | ')).join('\n')
  return `${head}\n${sep}\n${body}`
}

const server = new McpServer(
  { name: 'company-db', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.registerTool(
  'list_tables',
  {
    title: '数据库表清单',
    description: '列出可查询的表及其字段与类型（只读白名单）。查询前建议先调用本工具了解数据结构。',
    inputSchema: {},
  },
  async () => ({
    content: [{ type: 'text' as const, text: `可查询的表：\n${await describeTables()}` }],
  }),
)

server.registerTool(
  'query_readonly',
  {
    title: '只读查询',
    description:
      '对公司数据库执行只读 SELECT 查询并返回结果（最多 ' + MAX_ROWS + ' 行）。' +
      '约束：只能查询白名单内的表（用 list_tables 查看）；只读连接，写操作会被拒绝。' +
      '未写 LIMIT 时会自动追加。',
    inputSchema: {
      sql: z.string().describe('SELECT 查询语句，如：SELECT region_id, sum(amount) FROM demo_sales.orders GROUP BY 1'),
    },
  },
  async ({ sql }: { sql: string }) => {
    const reason = isAllowedQuery(sql)
    if (reason) {
      return { content: [{ type: 'text' as const, text: `查询被拒绝：${reason}` }], isError: true }
    }
    const started = Date.now()
    const { rows } = await pool.query(ensureLimit(sql))
    const duration = Date.now() - started
    const truncated = rows.length > MAX_ROWS ? rows.slice(0, MAX_ROWS) : rows
    let text = fmtRows(truncated)
    text += `\n\n${rows.length} 行（显示 ${truncated.length} 行，上限 ${MAX_ROWS}），耗时 ${duration}ms`
    if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS) + '\n…(结果已截断)'
    return { content: [{ type: 'text' as const, text }] }
  },
)

await server.connect(new StdioServerTransport())
console.error(`[company-mcp-db] stdio ready; whitelist=${ALLOWED_TABLES.join(',')}`)
