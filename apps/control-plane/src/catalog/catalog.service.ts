import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { AuditStore } from '../common/audit.store.js'
import { PgStore } from '../store/pg.store.js'
import { SecretsService } from '../secrets/secrets.service.js'
import { MemoryCatalogRepo, PgCatalogRepo, type CatalogRepo } from './catalog.store.js'
import { topoOrder, validateGraphSpec, validateToolBinding } from './graph-spec.js'
import { interpolate, interpolateArgs } from './interpolate.js'
import { defaultPgQuery, invokeTool, type FetchLike, type PgQueryFn } from './invoke.js'
import {
  CatalogError, ID_RE,
  type AgentTaskLookup, type AgentTaskRunner, type CatalogTool, type Connector, type GraphRecord, type GraphRevision,
  type GraphRun, type GraphSpec, type GraphStep, type PublishedAgentLookup, type Visibility,
} from './types.js'

const SECRET_REF = /^[A-Za-z_][A-Za-z0-9_]*$/

export interface CatalogDeps {
  agents: PublishedAgentLookup
  runAgent?: AgentTaskRunner
  getAgentTask?: AgentTaskLookup
  fetchFn?: FetchLike
  queryPg?: PgQueryFn
}

@Injectable()
export class CatalogService {
  private readonly repo: CatalogRepo

  constructor(
    pg: PgStore,
    private readonly audit: AuditStore,
    private readonly secrets: SecretsService,
    private readonly deps: CatalogDeps,
  ) {
    this.repo = pg.pool ? new PgCatalogRepo(pg.pool) : new MemoryCatalogRepo()
  }

  private async agentPublished(id: string): Promise<boolean> {
    const a = await this.deps.agents.get(id)
    return a?.status === 'published'
  }

  // ── connectors ──

  async putConnector(input: Omit<Connector, 'updatedAt' | 'status'> & { status?: Connector['status'] }, actor: string): Promise<Connector> {
    if (!ID_RE.test(input.id)) throw new CatalogError('连接器 id 非法', 400)
    if (!SECRET_REF.test(input.secretRef)) throw new CatalogError('secretRef 非法', 400)
    switch (input.kind) {
      case 'http':
        if (!input.http?.baseUrl?.startsWith('http')) throw new CatalogError('HTTP 连接器必须有 http(s) baseUrl', 400)
        if (!input.http.allowedMethods?.length) throw new CatalogError('HTTP 连接器必须声明 allowedMethods', 400)
        break
      case 'postgres':
        if (!input.postgres?.allowedTables?.length) throw new CatalogError('PG 连接器必须有表白名单', 400)
        if (!input.postgres.maxRows || input.postgres.maxRows < 1) throw new CatalogError('maxRows 必须 ≥ 1', 400)
        break
      default: {
        const _k: never = input.kind
        throw new CatalogError(`未知连接器类型：${String(_k)}`, 400)
      }
    }
    const prev = await this.repo.getConnector(input.id)
    const row: Connector = {
      ...input,
      status: prev?.status ?? 'draft',
      updatedBy: actor,
      updatedAt: new Date().toISOString(),
    }
    await this.repo.upsertConnector(row)
    await this.audit.append({ userId: actor, eventType: 'catalog.connector.put', payload: { id: row.id, kind: row.kind } })
    return this.publicConnector(row)
  }

  async publishConnector(id: string, actor: string): Promise<Connector> {
    const c = await this.requireConnector(id)
    await this.assertSecretConfigured(c.secretRef)
    c.status = 'published'
    c.updatedBy = actor
    c.updatedAt = new Date().toISOString()
    await this.repo.upsertConnector(c)
    await this.audit.append({ userId: actor, eventType: 'catalog.connector.publish', payload: { id } })
    return this.publicConnector(c)
  }

  async listConnectors(): Promise<Connector[]> {
    return (await this.repo.listConnectors()).map((c) => this.publicConnector(c))
  }

  async deleteConnector(id: string, actor: string): Promise<void> {
    const used = await this.repo.toolsForConnector(id)
    if (used.length) throw new CatalogError('仍有工具引用该连接器', 409)
    const ok = await this.repo.deleteConnector(id)
    if (!ok) throw new CatalogError('连接器不存在', 404)
    await this.audit.append({ userId: actor, eventType: 'catalog.connector.delete', payload: { id } })
  }

  // ── tools ──

  async putTool(input: Omit<CatalogTool, 'updatedAt' | 'status'> & { status?: CatalogTool['status'] }, actor: string): Promise<CatalogTool> {
    if (!ID_RE.test(input.id)) throw new CatalogError('工具 id 非法', 400)
    const connector = await this.requireConnector(input.connectorId)
    if (input.binding.kind === 'http' && connector.kind !== 'http') throw new CatalogError('HTTP 工具必须挂 HTTP 连接器', 400)
    if (input.binding.kind === 'postgres' && connector.kind !== 'postgres') throw new CatalogError('PG 工具必须挂 PG 连接器', 400)
    const bind = validateToolBinding(input as CatalogTool)
    if (!bind.ok) throw new CatalogError(bind.errors.map((e) => e.message).join('; '), 422)
    const prev = await this.repo.getTool(input.id)
    const row: CatalogTool = {
      ...input,
      status: prev?.status ?? 'draft',
      updatedBy: actor,
      updatedAt: new Date().toISOString(),
    }
    await this.repo.upsertTool(row)
    await this.audit.append({ userId: actor, eventType: 'catalog.tool.put', payload: { id: row.id } })
    return row
  }

  async publishTool(id: string, actor: string): Promise<CatalogTool> {
    const t = await this.requireTool(id)
    const c = await this.requireConnector(t.connectorId)
    if (c.status !== 'published') throw new CatalogError('必须先发布连接器', 409)
    t.status = 'published'
    t.updatedBy = actor
    t.updatedAt = new Date().toISOString()
    await this.repo.upsertTool(t)
    await this.audit.append({ userId: actor, eventType: 'catalog.tool.publish', payload: { id } })
    return t
  }

  async listTools(): Promise<CatalogTool[]> {
    return this.repo.listTools()
  }

  async deleteTool(id: string, actor: string): Promise<void> {
    const graphs = await this.repo.listGraphs()
    const inUse = graphs.some((g) => (g.spec.nodes ?? []).some((n) => n.kind === 'tool' && n.toolId === id)
      || (g.publishedSpec?.nodes ?? []).some((n) => n.kind === 'tool' && n.toolId === id))
    if (inUse) throw new CatalogError('仍有图引用该工具', 409)
    const ok = await this.repo.deleteTool(id)
    if (!ok) throw new CatalogError('工具不存在', 404)
    await this.audit.append({ userId: actor, eventType: 'catalog.tool.delete', payload: { id } })
  }

  // ── graphs ──

  async putGraph(
    input: { id: string; name: string; description?: string; visibility?: Visibility; spec: GraphSpec },
    actor: string,
  ): Promise<GraphRecord> {
    if (!ID_RE.test(input.id)) throw new CatalogError('图 id 非法', 400)
    await this.assertSpec(input.spec, { draft: true })
    const prev = await this.repo.getGraph(input.id)
    const row: GraphRecord = {
      id: input.id,
      name: input.name,
      description: input.description ?? '',
      visibility: input.visibility ?? {},
      spec: input.spec,
      status: prev?.status ?? 'draft',
      publishedSpec: prev?.publishedSpec ?? null,
      version: prev?.version ?? 0,
      updatedBy: actor,
      updatedAt: new Date().toISOString(),
    }
    await this.repo.upsertGraph(row)
    await this.audit.append({ userId: actor, eventType: 'catalog.graph.put', payload: { id: row.id } })
    return row
  }

  async publishGraph(id: string, actor: string): Promise<GraphRecord> {
    const g = await this.requireGraph(id)
    await this.assertSpec(g.spec)
    await this.assertGraphSecrets(g.spec)
    g.publishedSpec = g.spec
    g.status = 'published'
    g.version = g.version + 1
    g.updatedBy = actor
    g.updatedAt = new Date().toISOString()
    await this.repo.upsertGraph(g)
    await this.repo.insertGraphRevision({
      graphId: g.id,
      version: g.version,
      name: g.name,
      description: g.description,
      visibility: g.visibility,
      spec: g.spec,
      publishedBy: actor,
      publishedAt: g.updatedAt,
    })
    await this.audit.append({ userId: actor, eventType: 'catalog.graph.publish', payload: { id, version: g.version } })
    return g
  }

  async unpublishGraph(id: string, actor: string): Promise<GraphRecord> {
    const g = await this.requireGraph(id)
    g.status = 'draft'
    g.updatedBy = actor
    g.updatedAt = new Date().toISOString()
    await this.repo.upsertGraph(g)
    await this.audit.append({ userId: actor, eventType: 'catalog.graph.unpublish', payload: { id } })
    return g
  }

  async listGraphRevisions(id: string): Promise<GraphRevision[]> {
    await this.requireGraph(id)
    return this.repo.listGraphRevisions(id)
  }

  /** 回滚：把目标修订写回工作副本后立即 publish（新版本）。 */
  async rollbackGraph(id: string, toVersion: number, actor: string): Promise<GraphRecord> {
    const rev = await this.repo.getGraphRevision(id, toVersion)
    if (!rev) throw new CatalogError(`修订 v${toVersion} 不存在`, 404)
    await this.putGraph({
      id,
      name: rev.name,
      description: rev.description,
      visibility: rev.visibility,
      spec: rev.spec,
    }, actor)
    return this.publishGraph(id, actor)
  }

  async getGraphAdmin(id: string): Promise<GraphRecord> {
    return this.requireGraph(id)
  }

  async listGraphsAdmin(): Promise<GraphRecord[]> {
    return this.repo.listGraphs()
  }

  async listGraphsFor(role: string, dept: string): Promise<Array<Pick<GraphRecord, 'id' | 'name' | 'description' | 'version'>>> {
    const all = await this.repo.listGraphs()
    return all.filter((g) => {
      if (g.status !== 'published' || !g.publishedSpec) return false
      const r = g.visibility.roles
      if (r && r.length && !r.includes(role)) return false
      const d = g.visibility.departments
      if (d && d.length && !d.includes(dept)) return false
      return true
    }).map((g) => ({ id: g.id, name: g.name, description: g.description, version: g.version }))
  }

  async getPublishedGraph(id: string, role: string, dept: string): Promise<GraphRecord> {
    const g = await this.requireGraph(id)
    const visible = (await this.listGraphsFor(role, dept)).some((x) => x.id === id)
    if (!visible) throw new CatalogError('图不存在', 404)
    return g
  }

  /** 员工跑已发布图。 */
  async runGraph(id: string, userId: string, role: string, dept: string, input: Record<string, unknown>): Promise<GraphRun> {
    const g = await this.getPublishedGraph(id, role, dept)
    return this.executeSpec(g.id, g.publishedSpec!, userId, input)
  }

  /** 管理员试跑工作副本（不必已发布）。 */
  async trialRunGraph(id: string, userId: string, input: Record<string, unknown>): Promise<GraphRun> {
    const g = await this.requireGraph(id)
    await this.assertSpec(g.spec)
    return this.executeSpec(g.id, g.spec, userId, input)
  }

  private async executeSpec(graphId: string, spec: GraphSpec, userId: string, input: Record<string, unknown>): Promise<GraphRun> {
    const run: GraphRun = {
      id: randomUUID(),
      graphId,
      userId,
      status: 'running',
      input,
      steps: [],
      createdAt: new Date().toISOString(),
    }
    await this.repo.insertRun(run)
    return this.driveRun(run, spec)
  }

  async getRun(id: string, userId: string, isAdmin: boolean): Promise<GraphRun> {
    const r = await this.repo.getRun(id)
    if (!r) throw new CatalogError('运行记录不存在', 404)
    if (r.userId !== userId && !isAdmin) throw new CatalogError('运行记录不存在', 404)
    if (r.status === 'awaiting_approval' || r.status === 'running') return this.resumeRun(r, isAdmin)
    return r
  }

  async latestRun(graphId: string): Promise<GraphRun | undefined> {
    await this.requireGraph(graphId)
    const r = await this.repo.latestRun(graphId)
    if (!r) return undefined
    if (r.status === 'awaiting_approval' || r.status === 'running') return this.resumeRun(r, true)
    return r
  }

  private readonly resuming = new Set<string>()

  private async resumeRun(run: GraphRun, isAdmin: boolean): Promise<GraphRun> {
    if (this.resuming.has(run.id)) return run
    this.resuming.add(run.id)
    try {
      const g = await this.requireGraph(run.graphId)
      const spec = isAdmin ? g.spec : (g.publishedSpec ?? g.spec)
      const step = [...run.steps].reverse().find((s) => s.status === 'awaiting_approval')
      if (!step) return run
      const taskId = step.taskId
        ?? (step.output?.startsWith('awaitingApproval:') ? step.output.slice('awaitingApproval:'.length) : undefined)
      if (!taskId || !this.deps.getAgentTask) return run
      const t = await this.deps.getAgentTask(taskId)
      if (!t) return run
      if (t.status === 'done') {
        step.status = 'done'
        step.output = t.output ?? ''
        step.ok = true
        step.taskId = taskId
        run.status = 'running'
        run.finishedAt = undefined
        await this.repo.updateRun(run)
        return this.driveRun(run, spec)
      }
      if (t.status === 'failed' || t.status === 'killed') {
        step.status = 'failed'
        step.error = t.error ?? t.status
        step.ok = false
        run.status = 'failed'
        run.error = t.error ?? `节点 ${step.nodeId} 失败`
        await this.finish(run)
        return run
      }
      if (t.status === 'running') {
        run.status = 'running'
        step.output = '执行中…'
        await this.repo.updateRun(run)
        return run
      }
      return run
    } finally {
      this.resuming.delete(run.id)
    }
  }

  private async driveRun(run: GraphRun, spec: GraphSpec): Promise<GraphRun> {
    const topo = topoOrder(spec)
    if (!topo.ok || !topo.order) throw new CatalogError('图无效', 422)

    const nodeOut = new Map<string, { output: string; ok: boolean }>()
    const doneIds = new Set<string>()
    for (const s of run.steps) {
      if (s.status === 'awaiting_approval') continue
      doneIds.add(s.nodeId)
      nodeOut.set(s.nodeId, { output: s.output ?? '', ok: s.status === 'done' && s.ok !== false })
    }

    const preds = new Map<string, string[]>()
    for (const n of spec.nodes) preds.set(n.id, [])
    for (const e of spec.edges) preds.get(e.to)?.push(e.from)

    try {
      for (const nodeId of topo.order) {
        if (doneIds.has(nodeId)) continue
        const node = spec.nodes.find((n) => n.id === nodeId)
        if (!node) continue
        const skipped = (preds.get(nodeId) ?? []).some((p) => {
          const o = nodeOut.get(p)
          return !o || !o.ok
        })
        if (skipped) {
          run.steps.push({ nodeId, kind: node.kind, status: 'skipped', ok: false })
          nodeOut.set(nodeId, { output: '', ok: false })
          doneIds.add(nodeId)
          await this.repo.updateRun(run)
          continue
        }
        const ctx = {
          input: run.input,
          nodes: Object.fromEntries([...nodeOut.entries()].map(([k, v]) => [k, { output: v.output, ok: v.ok }])),
        }
        const step = await this.runNode(node, run.userId, ctx)
        run.steps.push(step)
        const ok = step.status === 'done' && step.ok !== false
        nodeOut.set(nodeId, { output: step.output ?? '', ok })
        doneIds.add(nodeId)
        if (step.status === 'awaiting_approval') {
          run.status = 'awaiting_approval'
          run.finishedAt = undefined
          await this.repo.updateRun(run)
          return run
        }
        if (!ok && spec.onError === 'stop') {
          run.status = 'failed'
          run.error = step.error ?? `节点 ${nodeId} 失败`
          await this.finish(run)
          return run
        }
        await this.repo.updateRun(run)
      }
      run.status = 'done'
      const last = [...nodeOut.values()].filter((v) => v.ok).at(-1)
      run.result = last?.output ?? ''
      await this.finish(run)
      await this.audit.append({
        userId: run.userId,
        eventType: 'catalog.graph.run',
        payload: { graphId: run.graphId, runId: run.id, status: run.status },
      })
      return run
    } catch (e) {
      run.status = 'failed'
      run.error = (e as Error).message
      await this.finish(run)
      return run
    }
  }

  private async runNode(
    node: GraphRecord['spec']['nodes'][number],
    userId: string,
    ctx: Record<string, unknown>,
  ): Promise<GraphStep> {
    switch (node.kind) {
      case 'gate': {
        const value = interpolate(node.when ?? '', ctx).trim().toLowerCase()
        const ok = value === 'true' || value === '1' || value === 'yes'
        return { nodeId: node.id, kind: 'gate', status: 'done', output: String(ok), ok }
      }
      case 'agent': {
        const task = interpolate(node.promptTemplate ?? '', ctx)
        const runner = this.deps.runAgent
        if (!runner) throw new CatalogError('未配置 Agent 运行器', 500)
        const r = await runner({ userId, agentPresetId: node.agentPresetId!, task })
        const taskId = r.taskId
          ?? (r.output.startsWith('awaitingApproval:') ? r.output.slice('awaitingApproval:'.length) : undefined)
        if (r.awaitingApproval) {
          return { nodeId: node.id, kind: 'agent', status: 'awaiting_approval', output: r.output, ok: false, taskId }
        }
        return { nodeId: node.id, kind: 'agent', status: 'done', output: r.output, ok: true, taskId }
      }
      case 'tool': {
        const tool = await this.requireTool(node.toolId!)
        if (tool.status !== 'published') throw new CatalogError(`工具 ${tool.id} 未发布`, 409)
        const connector = await this.requireConnector(tool.connectorId)
        const secretHit = await this.secrets.resolve(connector.secretRef, { via: 'graph-tool', actorId: userId })
        if (!secretHit) throw new CatalogError(`连接器密钥 ${connector.secretRef} 未配置`, 500)
        const argValues = interpolateArgs(node.argsTemplate, ctx)
        const output = await invokeTool({
          connector,
          tool,
          secret: secretHit.value,
          argValues,
          fetchFn: this.deps.fetchFn ?? ((url, init) => fetch(url, init)),
          queryPg: this.deps.queryPg ?? defaultPgQuery,
        })
        return { nodeId: node.id, kind: 'tool', status: 'done', output, ok: true }
      }
      default: {
        const _k: never = node.kind
        throw new CatalogError(`未知节点类型：${String(_k)}`, 400)
      }
    }
  }

  private async assertSpec(spec: GraphSpec, opts?: { draft?: boolean }): Promise<void> {
    const tools = await this.repo.listTools()
    const publishedTools = new Set(tools.filter((t) => t.status === 'published').map((t) => t.id))
    const agentIds = new Set<string>()
    for (const n of spec.nodes ?? []) {
      if (n.kind === 'agent' && n.agentPresetId && await this.agentPublished(n.agentPresetId)) {
        agentIds.add(n.agentPresetId)
      }
    }
    const v = validateGraphSpec(spec, { publishedAgentIds: agentIds, publishedToolIds: publishedTools }, opts)
    if (!v.ok) throw new CatalogError(v.errors.map((e) => `${e.path}: ${e.message}`).join('; '), 422)
  }

  private async assertSecretConfigured(ref: string): Promise<void> {
    const info = await this.secrets.describe(ref)
    if (!info.configured) {
      throw new CatalogError(`密钥 ${ref} 未配置：请先 PUT /admin/secrets/${ref}`, 409)
    }
  }

  private async assertGraphSecrets(spec: GraphSpec): Promise<void> {
    const seen = new Set<string>()
    for (const n of spec.nodes ?? []) {
      if (n.kind !== 'tool' || !n.toolId) continue
      const tool = await this.requireTool(n.toolId)
      const connector = await this.requireConnector(tool.connectorId)
      if (seen.has(connector.secretRef)) continue
      seen.add(connector.secretRef)
      await this.assertSecretConfigured(connector.secretRef)
    }
  }

  private publicConnector(c: Connector): Connector {
    return { ...c }
  }

  private async requireConnector(id: string): Promise<Connector> {
    const c = await this.repo.getConnector(id)
    if (!c) throw new CatalogError('连接器不存在', 404)
    return c
  }

  private async requireTool(id: string): Promise<CatalogTool> {
    const t = await this.repo.getTool(id)
    if (!t) throw new CatalogError('工具不存在', 404)
    return t
  }

  private async requireGraph(id: string): Promise<GraphRecord> {
    const g = await this.repo.getGraph(id)
    if (!g) throw new CatalogError('图不存在', 404)
    return g
  }

  private async finish(run: GraphRun): Promise<void> {
    run.finishedAt = new Date().toISOString()
    await this.repo.updateRun(run)
  }
}
