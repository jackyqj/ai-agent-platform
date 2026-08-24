import pg from 'pg'
import { interpolate } from './interpolate.js'
import { assertReadonlySelect, ensureLimit } from './sql-guard.js'
import { validateHttpPath } from './graph-spec.js'
import { CatalogError, type CatalogTool, type Connector } from './types.js'

export type FetchLike = (url: string, init: RequestInit) => Promise<{ status: number; text(): Promise<string> }>

export type PgQueryFn = (dsn: string, sql: string) => Promise<{ rows: Record<string, unknown>[] }>

export async function defaultPgQuery(dsn: string, sql: string): Promise<{ rows: Record<string, unknown>[] }> {
  const client = new pg.Client({
    connectionString: dsn,
    options: '-c default_transaction_read_only=on -c statement_timeout=10000',
  })
  await client.connect()
  try {
    const res = await client.query(sql)
    return { rows: res.rows as Record<string, unknown>[] }
  } finally {
    await client.end()
  }
}

function fmtRows(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '(0 行)'
  return JSON.stringify(rows)
}

export async function invokeTool(args: {
  connector: Connector
  tool: CatalogTool
  secret: string
  argValues: Record<string, string>
  fetchFn: FetchLike
  queryPg: PgQueryFn
}): Promise<string> {
  const { connector, tool, secret, argValues, fetchFn, queryPg } = args
  switch (tool.binding.kind) {
    case 'http':
      return invokeHttp(connector, tool, secret, argValues, fetchFn)
    case 'postgres':
      return invokePostgres(connector, tool, secret, argValues, queryPg)
    default: {
      const _b: never = tool.binding
      throw new CatalogError(`未知工具 binding：${String(_b)}`, 400)
    }
  }
}

async function invokeHttp(
  connector: Connector,
  tool: CatalogTool,
  secret: string,
  argValues: Record<string, string>,
  fetchFn: FetchLike,
): Promise<string> {
  if (connector.kind !== 'http' || !connector.http) throw new CatalogError('连接器不是 HTTP', 400)
  if (tool.binding.kind !== 'http') throw new CatalogError('工具不是 HTTP', 400)
  const method = tool.binding.method
  if (!connector.http.allowedMethods.includes(method)) {
    throw new CatalogError(`方法 ${method} 不在连接器允许列表`, 400)
  }
  const ctx = { input: argValues, args: argValues }
  const path = interpolate(tool.binding.pathTemplate, ctx)
  const pathErr = validateHttpPath(path)
  if (pathErr) throw new CatalogError(pathErr, 400)
  const url = connector.http.baseUrl.replace(/\/$/, '') + path
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${secret}` },
  }
  if (method !== 'GET' && argValues.body) {
    init.headers = { ...init.headers, 'Content-Type': 'application/json' }
    init.body = argValues.body
  }
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 10_000)
  try {
    const res = await fetchFn(url, { ...init, signal: ac.signal })
    const text = await res.text()
    if (res.status >= 400) throw new CatalogError(`HTTP ${res.status}: ${text.slice(0, 500)}`, 502)
    return text
  } finally {
    clearTimeout(t)
  }
}

async function invokePostgres(
  connector: Connector,
  tool: CatalogTool,
  secret: string,
  argValues: Record<string, string>,
  queryPg: PgQueryFn,
): Promise<string> {
  if (connector.kind !== 'postgres' || !connector.postgres) throw new CatalogError('连接器不是 PostgreSQL', 400)
  if (tool.binding.kind !== 'postgres') throw new CatalogError('工具不是 PostgreSQL', 400)
  const tables = connector.postgres.allowedTables
  const maxRows = connector.postgres.maxRows
  switch (tool.binding.mode) {
    case 'list_tables':
      return tables.join(', ') || '(无表白名单)'
    case 'query_readonly': {
      const sql = argValues.sql ?? argValues.query ?? ''
      const bad = assertReadonlySelect(sql, tables)
      if (bad) throw new CatalogError(bad, 400)
      const limited = ensureLimit(sql, maxRows)
      const { rows } = await queryPg(secret, limited)
      return fmtRows(rows.slice(0, maxRows))
    }
    default: {
      const _m: never = tool.binding.mode
      throw new CatalogError(`未知 postgres mode：${String(_m)}`, 400)
    }
  }
}

