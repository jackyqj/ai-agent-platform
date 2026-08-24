import type pg from 'pg'
import type { CatalogTool, Connector, GraphRecord, GraphRevision, GraphRun, GraphSpec } from './types.js'

export interface CatalogRepo {
  upsertConnector(c: Connector): Promise<void>
  getConnector(id: string): Promise<Connector | undefined>
  listConnectors(): Promise<Connector[]>
  deleteConnector(id: string): Promise<boolean>

  upsertTool(t: CatalogTool): Promise<void>
  getTool(id: string): Promise<CatalogTool | undefined>
  listTools(): Promise<CatalogTool[]>
  deleteTool(id: string): Promise<boolean>
  toolsForConnector(connectorId: string): Promise<CatalogTool[]>

  upsertGraph(g: GraphRecord): Promise<void>
  getGraph(id: string): Promise<GraphRecord | undefined>
  listGraphs(): Promise<GraphRecord[]>
  insertGraphRevision(r: GraphRevision): Promise<void>
  listGraphRevisions(graphId: string): Promise<GraphRevision[]>
  getGraphRevision(graphId: string, version: number): Promise<GraphRevision | undefined>

  insertRun(r: GraphRun): Promise<void>
  updateRun(r: GraphRun): Promise<void>
  getRun(id: string): Promise<GraphRun | undefined>
  latestRun(graphId: string): Promise<GraphRun | undefined>
}

function nowIso(): string {
  return new Date().toISOString()
}

export class MemoryCatalogRepo implements CatalogRepo {
  readonly connectors = new Map<string, Connector>()
  readonly tools = new Map<string, CatalogTool>()
  readonly graphs = new Map<string, GraphRecord>()
  readonly revisions = new Map<string, GraphRevision>()
  readonly runs = new Map<string, GraphRun>()

  private revKey(graphId: string, version: number): string {
    return `${graphId}#${version}`
  }

  async upsertConnector(c: Connector): Promise<void> {
    this.connectors.set(c.id, { ...c, updatedAt: c.updatedAt || nowIso() })
  }
  async getConnector(id: string): Promise<Connector | undefined> {
    return this.connectors.get(id)
  }
  async listConnectors(): Promise<Connector[]> {
    return [...this.connectors.values()]
  }
  async deleteConnector(id: string): Promise<boolean> {
    return this.connectors.delete(id)
  }
  async upsertTool(t: CatalogTool): Promise<void> {
    this.tools.set(t.id, { ...t, updatedAt: t.updatedAt || nowIso() })
  }
  async getTool(id: string): Promise<CatalogTool | undefined> {
    return this.tools.get(id)
  }
  async listTools(): Promise<CatalogTool[]> {
    return [...this.tools.values()]
  }
  async deleteTool(id: string): Promise<boolean> {
    return this.tools.delete(id)
  }
  async toolsForConnector(connectorId: string): Promise<CatalogTool[]> {
    return [...this.tools.values()].filter((t) => t.connectorId === connectorId)
  }
  async upsertGraph(g: GraphRecord): Promise<void> {
    this.graphs.set(g.id, { ...g, updatedAt: g.updatedAt || nowIso() })
  }
  async getGraph(id: string): Promise<GraphRecord | undefined> {
    return this.graphs.get(id)
  }
  async listGraphs(): Promise<GraphRecord[]> {
    return [...this.graphs.values()]
  }
  async insertGraphRevision(r: GraphRevision): Promise<void> {
    this.revisions.set(this.revKey(r.graphId, r.version), r)
  }
  async listGraphRevisions(graphId: string): Promise<GraphRevision[]> {
    return [...this.revisions.values()]
      .filter((r) => r.graphId === graphId)
      .sort((a, b) => b.version - a.version)
  }
  async getGraphRevision(graphId: string, version: number): Promise<GraphRevision | undefined> {
    return this.revisions.get(this.revKey(graphId, version))
  }
  async insertRun(r: GraphRun): Promise<void> {
    this.runs.set(r.id, r)
  }
  async updateRun(r: GraphRun): Promise<void> {
    this.runs.set(r.id, r)
  }
  async getRun(id: string): Promise<GraphRun | undefined> {
    return this.runs.get(id)
  }
  async latestRun(graphId: string): Promise<GraphRun | undefined> {
    return [...this.runs.values()]
      .filter((r) => r.graphId === graphId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  }
}

function connectorFromRow(r: Record<string, unknown>): Connector {
  const config = (r.config ?? {}) as { http?: Connector['http']; postgres?: Connector['postgres'] }
  return {
    id: String(r.id),
    name: String(r.name),
    kind: r.kind as Connector['kind'],
    status: r.status as Connector['status'],
    secretRef: String(r.secretRef ?? r.secret_ref),
    http: config.http,
    postgres: config.postgres,
    updatedBy: r.updatedBy == null ? undefined : String(r.updatedBy),
    updatedAt: String(r.updatedAt ?? r.updated_at),
  }
}

function toolFromRow(r: Record<string, unknown>): CatalogTool {
  return {
    id: String(r.id),
    connectorId: String(r.connectorId ?? r.connector_id),
    name: String(r.name),
    description: String(r.description ?? ''),
    risk: r.risk as CatalogTool['risk'],
    status: r.status as CatalogTool['status'],
    binding: r.binding as CatalogTool['binding'],
    updatedBy: r.updatedBy == null ? undefined : String(r.updatedBy),
    updatedAt: String(r.updatedAt ?? r.updated_at),
  }
}

function graphFromRow(r: Record<string, unknown>): GraphRecord {
  return {
    id: String(r.id),
    name: String(r.name),
    description: String(r.description ?? ''),
    status: r.status as GraphRecord['status'],
    visibility: (r.visibility ?? {}) as GraphRecord['visibility'],
    spec: r.spec as GraphSpec,
    publishedSpec: (r.publishedSpec ?? r.published_spec ?? null) as GraphSpec | null,
    version: Number(r.version),
    updatedBy: r.updatedBy == null ? undefined : String(r.updatedBy),
    updatedAt: String(r.updatedAt ?? r.updated_at),
  }
}

function runFromRow(r: Record<string, unknown>): GraphRun {
  return {
    id: String(r.id),
    graphId: String(r.graphId ?? r.graph_id),
    userId: String(r.userId ?? r.user_id),
    status: r.status as GraphRun['status'],
    input: (r.input ?? {}) as GraphRun['input'],
    steps: (r.steps ?? []) as GraphRun['steps'],
    result: r.result == null ? undefined : String(r.result),
    error: r.error == null ? undefined : String(r.error),
    createdAt: String(r.createdAt ?? r.created_at),
    finishedAt: r.finishedAt == null && r.finished_at == null ? undefined : String(r.finishedAt ?? r.finished_at),
  }
}

function revisionFromRow(r: Record<string, unknown>): GraphRevision {
  return {
    graphId: String(r.graphId ?? r.graph_id),
    version: Number(r.version),
    name: String(r.name),
    description: String(r.description ?? ''),
    visibility: (r.visibility ?? {}) as GraphRecord['visibility'],
    spec: r.spec as GraphSpec,
    publishedBy: String(r.publishedBy ?? r.published_by),
    publishedAt: String(r.publishedAt ?? r.published_at),
  }
}

export class PgCatalogRepo implements CatalogRepo {
  constructor(private readonly pool: pg.Pool) {}

  async upsertConnector(c: Connector): Promise<void> {
    const config = { http: c.http, postgres: c.postgres }
    await this.pool.query(
      `INSERT INTO connectors (id, name, kind, status, secret_ref, config, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now())
       ON CONFLICT (id) DO UPDATE SET
         name=excluded.name, kind=excluded.kind, status=excluded.status, secret_ref=excluded.secret_ref,
         config=excluded.config, updated_by=excluded.updated_by, updated_at=now()`,
      [c.id, c.name, c.kind, c.status, c.secretRef, JSON.stringify(config), c.updatedBy ?? null],
    )
  }

  async getConnector(id: string): Promise<Connector | undefined> {
    const res = await this.pool.query(
      `SELECT id, name, kind, status, secret_ref AS "secretRef", config, updated_by AS "updatedBy", updated_at AS "updatedAt"
       FROM connectors WHERE id = $1`,
      [id],
    )
    return res.rows[0] ? connectorFromRow(res.rows[0]) : undefined
  }

  async listConnectors(): Promise<Connector[]> {
    const res = await this.pool.query(
      `SELECT id, name, kind, status, secret_ref AS "secretRef", config, updated_by AS "updatedBy", updated_at AS "updatedAt"
       FROM connectors ORDER BY updated_at DESC`,
    )
    return res.rows.map(connectorFromRow)
  }

  async deleteConnector(id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM connectors WHERE id = $1', [id])
    return (res.rowCount ?? 0) > 0
  }

  async upsertTool(t: CatalogTool): Promise<void> {
    await this.pool.query(
      `INSERT INTO catalog_tools (id, connector_id, name, description, risk, status, binding, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT (id) DO UPDATE SET
         connector_id=excluded.connector_id, name=excluded.name, description=excluded.description,
         risk=excluded.risk, status=excluded.status, binding=excluded.binding,
         updated_by=excluded.updated_by, updated_at=now()`,
      [t.id, t.connectorId, t.name, t.description, t.risk, t.status, JSON.stringify(t.binding), t.updatedBy ?? null],
    )
  }

  async getTool(id: string): Promise<CatalogTool | undefined> {
    const res = await this.pool.query(
      `SELECT id, connector_id AS "connectorId", name, description, risk, status, binding,
              updated_by AS "updatedBy", updated_at AS "updatedAt"
       FROM catalog_tools WHERE id = $1`,
      [id],
    )
    return res.rows[0] ? toolFromRow(res.rows[0]) : undefined
  }

  async listTools(): Promise<CatalogTool[]> {
    const res = await this.pool.query(
      `SELECT id, connector_id AS "connectorId", name, description, risk, status, binding,
              updated_by AS "updatedBy", updated_at AS "updatedAt"
       FROM catalog_tools ORDER BY updated_at DESC`,
    )
    return res.rows.map(toolFromRow)
  }

  async deleteTool(id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM catalog_tools WHERE id = $1', [id])
    return (res.rowCount ?? 0) > 0
  }

  async toolsForConnector(connectorId: string): Promise<CatalogTool[]> {
    const res = await this.pool.query(
      `SELECT id, connector_id AS "connectorId", name, description, risk, status, binding,
              updated_by AS "updatedBy", updated_at AS "updatedAt"
       FROM catalog_tools WHERE connector_id = $1`,
      [connectorId],
    )
    return res.rows.map(toolFromRow)
  }

  async upsertGraph(g: GraphRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO graphs (id, name, description, status, visibility, spec, published_spec, version, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       ON CONFLICT (id) DO UPDATE SET
         name=excluded.name, description=excluded.description, status=excluded.status, visibility=excluded.visibility,
         spec=excluded.spec, published_spec=excluded.published_spec, version=excluded.version,
         updated_by=excluded.updated_by, updated_at=now()`,
      [g.id, g.name, g.description, g.status, JSON.stringify(g.visibility), JSON.stringify(g.spec),
        g.publishedSpec ? JSON.stringify(g.publishedSpec) : null, g.version, g.updatedBy ?? null],
    )
  }

  async getGraph(id: string): Promise<GraphRecord | undefined> {
    const res = await this.pool.query(
      `SELECT id, name, description, status, visibility, spec, published_spec AS "publishedSpec",
              version, updated_by AS "updatedBy", updated_at AS "updatedAt"
       FROM graphs WHERE id = $1`,
      [id],
    )
    return res.rows[0] ? graphFromRow(res.rows[0]) : undefined
  }

  async listGraphs(): Promise<GraphRecord[]> {
    const res = await this.pool.query(
      `SELECT id, name, description, status, visibility, spec, published_spec AS "publishedSpec",
              version, updated_by AS "updatedBy", updated_at AS "updatedAt"
       FROM graphs ORDER BY updated_at DESC`,
    )
    return res.rows.map(graphFromRow)
  }

  async insertGraphRevision(r: GraphRevision): Promise<void> {
    await this.pool.query(
      `INSERT INTO graph_revisions (graph_id, version, name, description, visibility, spec, published_by, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [r.graphId, r.version, r.name, r.description, JSON.stringify(r.visibility), JSON.stringify(r.spec),
        r.publishedBy, r.publishedAt],
    )
  }

  async listGraphRevisions(graphId: string): Promise<GraphRevision[]> {
    const res = await this.pool.query(
      `SELECT graph_id AS "graphId", version, name, description, visibility, spec,
              published_by AS "publishedBy", published_at AS "publishedAt"
       FROM graph_revisions WHERE graph_id = $1 ORDER BY version DESC`,
      [graphId],
    )
    return res.rows.map(revisionFromRow)
  }

  async getGraphRevision(graphId: string, version: number): Promise<GraphRevision | undefined> {
    const res = await this.pool.query(
      `SELECT graph_id AS "graphId", version, name, description, visibility, spec,
              published_by AS "publishedBy", published_at AS "publishedAt"
       FROM graph_revisions WHERE graph_id = $1 AND version = $2`,
      [graphId, version],
    )
    return res.rows[0] ? revisionFromRow(res.rows[0]) : undefined
  }

  async insertRun(r: GraphRun): Promise<void> {
    await this.pool.query(
      `INSERT INTO graph_runs (id, graph_id, user_id, status, input, steps, result, error, created_at, finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [r.id, r.graphId, r.userId, r.status, JSON.stringify(r.input), JSON.stringify(r.steps),
        r.result ?? null, r.error ?? null, r.createdAt, r.finishedAt ?? null],
    )
  }

  async updateRun(r: GraphRun): Promise<void> {
    await this.pool.query(
      `UPDATE graph_runs SET status=$2, steps=$3, result=$4, error=$5, finished_at=$6 WHERE id=$1`,
      [r.id, r.status, JSON.stringify(r.steps), r.result ?? null, r.error ?? null, r.finishedAt ?? null],
    )
  }

  async getRun(id: string): Promise<GraphRun | undefined> {
    const res = await this.pool.query(
      `SELECT id, graph_id AS "graphId", user_id AS "userId", status, input, steps, result, error,
              created_at AS "createdAt", finished_at AS "finishedAt"
       FROM graph_runs WHERE id = $1`,
      [id],
    )
    return res.rows[0] ? runFromRow(res.rows[0]) : undefined
  }

  async latestRun(graphId: string): Promise<GraphRun | undefined> {
    const res = await this.pool.query(
      `SELECT id, graph_id AS "graphId", user_id AS "userId", status, input, steps, result, error,
              created_at AS "createdAt", finished_at AS "finishedAt"
       FROM graph_runs WHERE graph_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [graphId],
    )
    return res.rows[0] ? runFromRow(res.rows[0]) : undefined
  }
}
