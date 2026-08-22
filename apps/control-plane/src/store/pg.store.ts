// PG 访问（08 工单的会话存储是 DSH 侧缝，本文件是控制面元数据落库）
// DATABASE_URL 未配置时应用层回退内存（开发/冒烟），生产必须配置。
import pg from 'pg'

export interface AuditRow {
  id: number
  userId?: string | null
  sessionId?: string | null
  eventType: string
  payload: unknown
  ts: string
}

/** 定时任务（scheduled_tasks）列投影：list/get 共享，避免重复 */
const SCHED_TASK_COLS = `id, owner_user_id AS "ownerUserId", name, agent_preset_id AS "agentPresetId", schedule,
                  task_template AS "taskTemplate", status, timezone, last_run_at AS "lastRunAt",
                  last_run_status AS "lastRunStatus", next_run_at AS "nextRunAt", created_at AS "createdAt"`

export class PgStore {
  readonly pool: pg.Pool | null

  constructor(databaseUrl: string | undefined) {
    this.pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : null
  }

  async appendAudit(ev: { userId?: string; sessionId?: string; eventType: string; payload: unknown }): Promise<AuditRow> {
    const p = this.pool!
    const res = await p.query<AuditRow>(
      `INSERT INTO audit_events (user_id, session_id, event_type, payload)
       VALUES ($1, $2, $3, $4) RETURNING id, user_id AS "userId", session_id AS "sessionId", event_type AS "eventType", payload, ts`,
      [ev.userId ?? null, ev.sessionId ?? null, ev.eventType, JSON.stringify(ev.payload ?? {})],
    )
    return res.rows[0]
  }

  async queryAudit(f: { userId?: string; sessionId?: string; eventType?: string; from?: string; limit: number }): Promise<AuditRow[]> {
    const p = this.pool!
    const where: string[] = []
    const args: unknown[] = []
    if (f.userId) {
      args.push(f.userId)
      where.push(`user_id = $${args.length}`)
    }
    if (f.sessionId) {
      args.push(f.sessionId)
      where.push(`session_id = $${args.length}`)
    }
    if (f.eventType) {
      args.push(f.eventType)
      where.push(`event_type = $${args.length}`)
    }
    if (f.from) {
      args.push(f.from)
      where.push(`ts >= $${args.length}`)
    }
    args.push(f.limit)
    const res = await p.query<AuditRow>(
      `SELECT id, user_id AS "userId", session_id AS "sessionId", event_type AS "eventType", payload, ts
       FROM audit_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY ts DESC LIMIT $${args.length}`,
      args,
    )
    return res.rows
  }

  // --- 08：sessions / instances 落 PG（控制面元数据持久化） ---

  async insertSession(s: {
    id: string
    userId: string
    agentPresetId: string
    type: string
    instanceId?: string
    routingSecret: string
    status: string
  }): Promise<void> {
    await this.pool!.query(
      `INSERT INTO sessions (id, user_id, agent_preset_id, type, instance_id, routing_secret, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [s.id, s.userId, s.agentPresetId, s.type, s.instanceId ?? null, s.routingSecret, s.status],
    )
  }

  async getSession(id: string) {
    const res = await this.pool!.query(
      `SELECT id, user_id AS "userId", agent_preset_id AS "agentPresetId", type,
              instance_id AS "instanceId", routing_secret AS "routingSecret", status,
              created_at AS "createdAt", last_active_at AS "lastActiveAt"
       FROM sessions WHERE id = $1`,
      [id],
    )
    return res.rows[0] ?? undefined
  }

  async listSessions(userId: string) {
    const res = await this.pool!.query(
      `SELECT id, user_id AS "userId", agent_preset_id AS "agentPresetId", type,
              instance_id AS "instanceId", routing_secret AS "routingSecret", status,
              created_at AS "createdAt", last_active_at AS "lastActiveAt"
       FROM sessions WHERE user_id = $1 AND status <> 'closed' ORDER BY created_at DESC`,
      [userId],
    )
    return res.rows
  }

  async listSessionsAdmin(f: { userId?: string; from?: string; to?: string; limit: number }) {
    const where: string[] = []
    const args: unknown[] = []
    if (f.userId) {
      args.push(f.userId)
      where.push(`user_id = $${args.length}`)
    }
    if (f.from) {
      args.push(f.from)
      where.push(`created_at >= $${args.length}`)
    }
    if (f.to) {
      args.push(f.to)
      where.push(`created_at <= $${args.length}`)
    }
    args.push(f.limit)
    const res = await this.pool!.query(
      `SELECT id, user_id AS "userId", agent_preset_id AS "agentPresetId", type,
              instance_id AS "instanceId", routing_secret AS "routingSecret", status,
              created_at AS "createdAt", last_active_at AS "lastActiveAt"
       FROM sessions ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY created_at DESC LIMIT $${args.length}`,
      args,
    )
    return res.rows
  }

  async updateSessionStatus(id: string, status: string): Promise<void> {
    await this.pool!.query(`UPDATE sessions SET status = $2, last_active_at = now() WHERE id = $1`, [id, status])
  }

  async insertInstance(i: {
    id: string
    type: string
    userId?: string
    host: string
    port: number
    status: string
    containerId?: string
  }): Promise<void> {
    await this.pool!.query(
      `INSERT INTO instances (id, type, user_id, host, port, status, container_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [i.id, i.type, i.userId ?? null, i.host, i.port, i.status, i.containerId ?? null],
    )
  }

  async updateInstance(i: { id: string; status: string; heartbeat?: boolean }): Promise<void> {
    if (i.heartbeat) {
      await this.pool!.query(`UPDATE instances SET status = $2, last_heartbeat = now() WHERE id = $1`, [i.id, i.status])
    } else {
      await this.pool!.query(`UPDATE instances SET status = $2 WHERE id = $1`, [i.id, i.status])
    }
  }

  async listInstances(): Promise<{ id: string; type: string; userId: string | null; host: string; port: number; status: string; containerId: string | null; spawnAt: string; lastHeartbeat: string }[]> {
    const res = await this.pool!.query(
      `SELECT id, type, user_id AS "userId", host, port, status, container_id AS "containerId",
              spawn_at AS "spawnAt", last_heartbeat AS "lastHeartbeat"
       FROM instances ORDER BY spawn_at DESC`,
    )
    return res.rows
  }

  async markInstanceDead(id: string): Promise<void> {
    await this.pool!.query(`UPDATE instances SET status = 'dead' WHERE id = $1`, [id])
  }

  // --- 07：服务身份 API Key（api_keys 表） ---

  async insertApiKey(k: { id: string; name: string; keyHash: string; scopes: string[] }): Promise<void> {
    await this.pool!.query(
      `INSERT INTO api_keys (id, name, key_hash, scopes) VALUES ($1, $2, $3, $4)`,
      [k.id, k.name, k.keyHash, k.scopes],
    )
  }

  async getApiKeyByHash(keyHash: string) {
    const res = await this.pool!.query(
      `SELECT id, name, key_hash AS "keyHash", scopes, status, created_at AS "createdAt", last_used_at AS "lastUsedAt"
       FROM api_keys WHERE key_hash = $1`,
      [keyHash],
    )
    return res.rows[0] ?? undefined
  }

  async listApiKeys(): Promise<{ id: string; name: string; scopes: string[]; status: string; createdAt: string }[]> {
    const res = await this.pool!.query(
      `SELECT id, name, scopes, status, created_at AS "createdAt" FROM api_keys ORDER BY created_at DESC`,
    )
    return res.rows
  }

  async revokeApiKey(id: string): Promise<void> {
    await this.pool!.query(`UPDATE api_keys SET status = 'revoked' WHERE id = $1`, [id])
  }

  async touchApiKey(id: string): Promise<void> {
    await this.pool!.query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [id])
  }

  // --- 19：任务队列持久化（tasks 表） ---

  async insertTask(t: { id: string; userId: string; agentPresetId: string; payload: unknown }): Promise<void> {
    await this.pool!.query(
      `INSERT INTO tasks (id, user_id, agent_preset_id, payload) VALUES ($1, $2, $3, $4)`,
      [t.id, t.userId, t.agentPresetId, JSON.stringify(t.payload)],
    )
  }

  async getTask(id: string) {
    const res = await this.pool!.query(
      `SELECT id, user_id AS "userId", agent_preset_id AS "agentPresetId", payload, status,
              result, error, created_at AS "createdAt", started_at AS "startedAt", finished_at AS "finishedAt"
       FROM tasks WHERE id = $1`,
      [id],
    )
    return res.rows[0] ?? undefined
  }

  async listTasks(userId?: string, limit = 50) {
    const res = userId
      ? await this.pool!.query(
          `SELECT id, user_id AS "userId", agent_preset_id AS "agentPresetId", status, error,
                  created_at AS "createdAt", finished_at AS "finishedAt"
           FROM tasks WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
          [userId, limit],
        )
      : await this.pool!.query(
          `SELECT id, user_id AS "userId", agent_preset_id AS "agentPresetId", status, error,
                  created_at AS "createdAt", finished_at AS "finishedAt"
           FROM tasks ORDER BY created_at DESC LIMIT $1`,
          [limit],
        )
    return res.rows
  }

  async updateTask(id: string, patch: { status?: string; result?: unknown; error?: string; started?: boolean; finished?: boolean }): Promise<void> {
    const sets: string[] = []
    const args: unknown[] = []
    if (patch.status) {
      args.push(patch.status)
      sets.push(`status = $${args.length}`)
    }
    if (patch.result !== undefined) {
      args.push(JSON.stringify(patch.result))
      sets.push(`result = $${args.length}`)
    }
    if (patch.error !== undefined) {
      args.push(patch.error)
      sets.push(`error = $${args.length}`)
    }
    if (patch.started) sets.push(`started_at = now()`)
    if (patch.finished) sets.push(`finished_at = now()`)
    if (sets.length === 0) return
    args.push(id)
    await this.pool!.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $${args.length}`, args)
  }

  // --- 12：Agent 商店（agent_presets 表） ---

  async upsertAgentPreset(p: {
    id: string; name: string; description: string; visibility: unknown
    modelRoute: unknown; approvalLevel: string; status: string; version: number
  }): Promise<void> {
    await this.pool!.query(
      `INSERT INTO agent_presets (id, name, description, visibility, model_route, approval_level, status, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name, description = excluded.description,
         visibility = excluded.visibility, model_route = excluded.model_route,
         approval_level = excluded.approval_level, status = excluded.status,
         version = agent_presets.version + 1`,
      [p.id, p.name, p.description, JSON.stringify(p.visibility ?? {}), JSON.stringify(p.modelRoute ?? {}), p.approvalLevel, p.status, p.version],
    )
  }

  /** 种子入库：只插入缺失的 id，不覆盖已有（避免 upsert 误升 version）。 */
  async insertAgentPresetIfMissing(p: {
    id: string; name: string; description: string; visibility: unknown
    modelRoute: unknown; approvalLevel: string; status: string
  }): Promise<void> {
    await this.pool!.query(
      `INSERT INTO agent_presets (id, name, description, visibility, model_route, approval_level, status, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
       ON CONFLICT (id) DO NOTHING`,
      [p.id, p.name, p.description, JSON.stringify(p.visibility ?? {}), JSON.stringify(p.modelRoute ?? {}), p.approvalLevel, p.status],
    )
  }

  /** 删除 Agent：先删修订（外键无 CASCADE），再删目录行。 */
  async deleteAgentPreset(id: string): Promise<void> {
    await this.pool!.query(`DELETE FROM agent_preset_revisions WHERE preset_id = $1`, [id])
    await this.pool!.query(`DELETE FROM agent_presets WHERE id = $1`, [id])
  }

  async listAgentPresets(): Promise<Record<string, unknown>[]> {
    const res = await this.pool!.query(
      `SELECT id, name, description, visibility, model_route AS "modelRoute",
              approval_level AS "approvalLevel", approval_chain AS "approvalChain", status, version
       FROM agent_presets ORDER BY version DESC`,
    )
    return res.rows
  }

  async getAgentPreset(id: string) {
    const res = await this.pool!.query(
      `SELECT id, name, description, visibility, model_route AS "modelRoute",
              approval_level AS "approvalLevel", approval_chain AS "approvalChain", status, version
       FROM agent_presets WHERE id = $1`,
      [id],
    )
    return res.rows[0] ?? undefined
  }

  async updateAgentPresetStatus(id: string, status: string): Promise<void> {
    await this.pool!.query(`UPDATE agent_presets SET status = $2 WHERE id = $1`, [id, status])
  }

  /** 多级审批（14）：读取某 Agent 的审批链（编排外管理配置）；NULL=默认 ['admin'] */
  async getAgentApprovalChain(id: string): Promise<string[]> {
    const res = await this.pool!.query(`SELECT approval_chain AS "chain" FROM agent_presets WHERE id = $1`, [id])
    const chain = res.rows[0]?.chain
    return Array.isArray(chain) ? chain.map(String) : []
  }

  async setAgentApprovalChain(id: string, roles: string[]): Promise<void> {
    await this.pool!.query(`UPDATE agent_presets SET approval_chain = $2 WHERE id = $1`, [id, JSON.stringify(roles)])
  }

  async updateAgentPresetVisibility(id: string, visibility: unknown): Promise<void> {
    await this.pool!.query(`UPDATE agent_presets SET visibility = $2 WHERE id = $1`, [id, JSON.stringify(visibility ?? {})])
  }

  async updateAgentPresetBasedOn(id: string, basedOn: string): Promise<void> {
    await this.pool!.query(`UPDATE agent_presets SET based_on = $2 WHERE id = $1`, [id, basedOn])
  }

  // --- 12 Agent 编排（008）：composition 工作副本 + revisions 已发布真源 ---

  /** 只写工作副本（composition 列），不 bump version、不写文件。 */
  async updateAgentComposition(id: string, composition: unknown, updatedBy: string): Promise<void> {
    await this.pool!.query(
      `UPDATE agent_presets SET composition = $2, updated_by = $3, updated_at = now() WHERE id = $1`,
      [id, JSON.stringify(composition), updatedBy],
    )
  }

  async getAgentComposition(id: string) {
    const res = await this.pool!.query(
      `SELECT composition, version, updated_by AS "updatedBy", updated_at AS "updatedAt"
       FROM agent_presets WHERE id = $1`,
      [id],
    )
    return res.rows[0] ?? undefined
  }

  /**
   * 种子 spec 写入 composition（§11.1）：仅当该行当前无 composition 且无任何已发布修订时写入，
   * 不覆盖已有工作副本、不回写已发布的 agent。（幂等：种子只补一次。）
   */
  async ensureSeedComposition(id: string, spec: unknown): Promise<void> {
    await this.pool!.query(
      `UPDATE agent_presets SET composition = $2, updated_at = now()
       WHERE id = $1
         AND composition IS NULL
         AND NOT EXISTS (SELECT 1 FROM agent_preset_revisions r WHERE r.preset_id = $1)`,
      [id, JSON.stringify(spec)],
    )
  }

  async listAgentRevisions(id: string): Promise<Record<string, unknown>[]> {
    const res = await this.pool!.query(
      `SELECT preset_id AS "presetId", version, spec, compiled_yaml AS "compiledYaml",
              compiled_meta AS "compiledMeta", published_by AS "publishedBy", published_at AS "publishedAt"
       FROM agent_preset_revisions WHERE preset_id = $1 ORDER BY version DESC`,
      [id],
    )
    return res.rows
  }

  async getAgentRevision(id: string, version: number) {
    const res = await this.pool!.query(
      `SELECT preset_id AS "presetId", version, spec, compiled_yaml AS "compiledYaml",
              compiled_meta AS "compiledMeta", published_by AS "publishedBy", published_at AS "publishedAt"
       FROM agent_preset_revisions WHERE preset_id = $1 AND version = $2`,
      [id, version],
    )
    return res.rows[0] ?? undefined
  }

  /**
   * 发布事务（docs/agent-orchestration-design.md §10 步骤 4）：
   * 校验乐观并发 → 插修订 → 覆写投影列 + version+1，一次性提交。返回新 version。
   * 文件写入在事务 commit 之后由调用方执行（roster 只认文件 stamp）。
   */
  async publishAgentPreset(p: {
    id: string
    spec: unknown
    name: string
    description: string
    visibility: unknown
    modelRoute: unknown
    approvalLevel: string
    compiledYaml: string
    compiledMeta: string
    publishedBy: string
    expectedVersion: number
  }): Promise<number> {
    const client = await this.pool!.connect()
    try {
      await client.query('BEGIN')
      const cur = await client.query<{ version: number }>(
        `SELECT version FROM agent_presets WHERE id = $1 FOR UPDATE`, [p.id],
      )
      if (cur.rows.length === 0) throw new Error(`agent ${p.id} not found`)
      if (cur.rows[0].version !== p.expectedVersion) {
        throw new Error(`version conflict: expected ${p.expectedVersion}, got ${cur.rows[0].version}`)
      }
      const next = p.expectedVersion + 1
      await client.query(
        `INSERT INTO agent_preset_revisions (preset_id, version, spec, compiled_yaml, compiled_meta, published_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [p.id, next, JSON.stringify(p.spec), p.compiledYaml, p.compiledMeta, p.publishedBy],
      )
      await client.query(
        `UPDATE agent_presets SET version = $2, status = 'published',
                name = $3, description = $4, visibility = $5, model_route = $6, approval_level = $7,
                updated_by = $8, updated_at = now(),
                composition = NULL  -- 发布后工作副本已与最新修订一致，清掉避免 dirty 永真（§7）
         WHERE id = $1`,
        [p.id, next, p.name, p.description, JSON.stringify(p.visibility ?? {}), JSON.stringify(p.modelRoute ?? {}), p.approvalLevel, p.publishedBy],
      )
      await client.query('COMMIT')
      return next
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  }

  // --- 14：审批（approval_requests 表） ---

  async insertApproval(a: {
    id: string; requesterUserId: string; taskId?: string; agentPresetId: string
    action: string; level: string; status: string; expiresAt?: string
    chain?: string[]; currentLevel?: number
  }): Promise<void> {
    await this.pool!.query(
      `INSERT INTO approval_requests (id, requester_user_id, task_id, agent_preset_id, action, level, status, expires_at, chain, current_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [a.id, a.requesterUserId, a.taskId ?? null, a.agentPresetId, a.action, a.level, a.status, a.expiresAt ?? null, JSON.stringify(a.chain ?? []), a.currentLevel ?? 0],
    )
  }

  async getApproval(id: string) {
    const res = await this.pool!.query(
      `SELECT id, requester_user_id AS "requesterUserId", task_id AS "taskId", agent_preset_id AS "agentPresetId",
              action, level, status, chain, current_level AS "currentLevel",
              decided_by AS "decidedBy", decided_at AS "decidedAt",
              expires_at AS "expiresAt", created_at AS "createdAt"
       FROM approval_requests WHERE id = $1`,
      [id],
    )
    return res.rows[0] ?? undefined
  }

  async listApprovals(filter: { requesterUserId?: string; status?: string; limit: number }): Promise<Record<string, unknown>[]> {
    const where: string[] = []
    const args: unknown[] = []
    if (filter.requesterUserId) { args.push(filter.requesterUserId); where.push(`requester_user_id = $${args.length}`) }
    if (filter.status) { args.push(filter.status); where.push(`status = $${args.length}`) }
    args.push(filter.limit)
    const res = await this.pool!.query(
      `SELECT id, requester_user_id AS "requesterUserId", task_id AS "taskId", agent_preset_id AS "agentPresetId",
              action, level, status, chain, current_level AS "currentLevel",
              decided_by AS "decidedBy", decided_at AS "decidedAt",
              expires_at AS "expiresAt", created_at AS "createdAt"
       FROM approval_requests ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY created_at DESC LIMIT $${args.length}`,
      args,
    )
    return res.rows
  }

  async updateApproval(id: string, p: { status: string; decidedBy: string; currentLevel?: number }): Promise<void> {
    const sets: string[] = [`status = $2`, `decided_by = $3`, `decided_at = now()`]
    const args: unknown[] = [id, p.status, p.decidedBy]
    if (p.currentLevel !== undefined) { args.push(p.currentLevel); sets.push(`current_level = $${args.length}`) }
    await this.pool!.query(`UPDATE approval_requests SET ${sets.join(', ')} WHERE id = $1`, args)
  }

  /** 授权存储：同一 requester+preset+action 在有效期内有 approved 记录（记住 X 小时） */
  async findActiveGrant(requesterUserId: string, agentPresetId: string, action: string): Promise<boolean> {
    const res = await this.pool!.query(
      `SELECT 1 FROM approval_requests
       WHERE requester_user_id = $1 AND agent_preset_id = $2 AND action = $3
         AND status = 'approved' AND (expires_at IS NULL OR expires_at > now())
       LIMIT 1`,
      [requesterUserId, agentPresetId, action],
    )
    return res.rows.length > 0
  }

  // --- 16：配额（quota_policies / quota_usage 表） ---

  async listQuotaPolicies(): Promise<Record<string, unknown>[]> {
    const res = await this.pool!.query(
      `SELECT id, scope_type AS "scopeType", scope_id AS "scopeId", period,
              budget_requests AS "budgetRequests", budget_tokens AS "budgetTokens",
              budget_cost_cents AS "budgetCostCents", over_policy AS "overPolicy", created_at AS "createdAt"
       FROM quota_policies ORDER BY created_at`,
    )
    return res.rows
  }

  async upsertQuotaPolicy(p: {
    id?: string; scopeType: string; scopeId?: string; period: string
    budgetRequests: number; overPolicy: string
  }): Promise<void> {
    const id = p.id ?? undefined
    await this.pool!.query(
      `INSERT INTO quota_policies (id, scope_type, scope_id, period, budget_requests, over_policy)
       VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         scope_type = excluded.scope_type, scope_id = excluded.scope_id, period = excluded.period,
         budget_requests = excluded.budget_requests, over_policy = excluded.over_policy`,
      [id ?? null, p.scopeType, p.scopeId ?? null, p.period, p.budgetRequests, p.overPolicy],
    )
  }

  async getUsage(policyId: string, periodStart: string): Promise<number> {
    const res = await this.pool!.query(
      `SELECT used_requests FROM quota_usage WHERE policy_id = $1 AND period_start = $2`,
      [policyId, periodStart],
    )
    return Number(res.rows[0]?.used_requests ?? 0)
  }

  async bumpUsage(policyId: string, periodStart: string): Promise<void> {
    await this.pool!.query(
      `INSERT INTO quota_usage (policy_id, period_start, used_requests)
       VALUES ($1, $2, 1)
       ON CONFLICT (policy_id, period_start) DO UPDATE SET used_requests = quota_usage.used_requests + 1, updated_at = now()`,
      [policyId, periodStart],
    )
  }

  // --- 16：配额告警闭环（quota_alerts 表，warn 超限落可处置告警） ---

  async insertQuotaAlert(a: {
    policyId: string; userId?: string; scopeType: string; scopeId?: string
    period: string; budgetRequests: number; usedRequests: number; message: string
  }): Promise<boolean> {
    const res = await this.pool!.query(
      `INSERT INTO quota_alerts (policy_id, user_id, scope_type, scope_id, period, budget_requests, used_requests, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (policy_id, period, user_id) WHERE resolved_at IS NULL DO NOTHING`,
      [a.policyId, a.userId ?? null, a.scopeType, a.scopeId ?? null, a.period, a.budgetRequests, a.usedRequests, a.message],
    )
    return (res.rowCount ?? 0) > 0
  }

  async listQuotaAlerts(f: { openOnly?: boolean; limit: number }): Promise<Record<string, unknown>[]> {
    const res = await this.pool!.query(
      `SELECT id, policy_id AS "policyId", user_id AS "userId", scope_type AS "scopeType", scope_id AS "scopeId",
              period, budget_requests AS "budgetRequests", used_requests AS "usedRequests", message,
              resolved_at AS "resolvedAt", created_at AS "createdAt"
       FROM quota_alerts ${f.openOnly ? 'WHERE resolved_at IS NULL' : ''}
       ORDER BY created_at DESC LIMIT $1`,
      [f.limit],
    )
    return res.rows
  }

  /** 同一策略+周期下是否已有未处置告警（去重，避免 warn 每次调用都刷一条） */
  async hasOpenQuotaAlert(policyId: string, period: string, userId: string | undefined): Promise<boolean> {
    const res = await this.pool!.query(
      `SELECT 1 FROM quota_alerts
       WHERE policy_id = $1 AND period = $2 AND resolved_at IS NULL AND user_id IS NOT DISTINCT FROM $3
       LIMIT 1`,
      [policyId, period, userId ?? null],
    )
    return res.rows.length > 0
  }

  async resolveQuotaAlert(id: string): Promise<boolean> {
    const res = await this.pool!.query(
      `UPDATE quota_alerts SET resolved_at = now() WHERE id = $1 AND resolved_at IS NULL`,
      [id],
    )
    return (res.rowCount ?? 0) > 0
  }

  async countOpenQuotaAlerts(): Promise<number> {
    const res = await this.pool!.query(`SELECT count(*) AS c FROM quota_alerts WHERE resolved_at IS NULL`)
    return Number(res.rows[0]?.c ?? 0)
  }

  // --- 15：用量/审计聚合 ---

  async usageStats(): Promise<Record<string, unknown>> {
    const p = this.pool!
    const [byDay, byStatus, byAgent, approvals, recentErrors, quota] = await Promise.all([
      p.query(
        `SELECT to_char(created_at, 'MM-DD') AS day, count(*) AS total,
                count(*) FILTER (WHERE status = 'failed') AS failed
         FROM tasks WHERE created_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1`,
      ),
      p.query(`SELECT status, count(*) AS total FROM tasks GROUP BY 1 ORDER BY 2 DESC`),
      p.query(
        `SELECT agent_preset_id AS agent, count(*) AS total, count(*) FILTER (WHERE status = 'failed') AS failed
         FROM tasks GROUP BY 1 ORDER BY 2 DESC`,
      ),
      p.query(`SELECT status, count(*) AS total FROM approval_requests GROUP BY 1 ORDER BY 2 DESC`),
      p.query(
        `SELECT left(id::text, 8) AS id, agent_preset_id AS agent, left(error, 60) AS error, created_at AS at
         FROM tasks WHERE status = 'failed' ORDER BY created_at DESC LIMIT 5`,
      ),
      p.query(
        `SELECT p.scope_type AS scope, p.scope_id, p.budget_requests AS budget,
                COALESCE(u.used_requests, 0) AS used
         FROM quota_policies p
         LEFT JOIN quota_usage u ON u.policy_id = p.id
           AND u.period_start = CURRENT_DATE`,
      ),
    ])
    const openAlerts = await this.countOpenQuotaAlerts()
    return {
      tasksByDay: byDay.rows,
      tasksByStatus: byStatus.rows,
      tasksByAgent: byAgent.rows,
      approvals: approvals.rows,
      recentErrors: recentErrors.rows,
      quotaToday: quota.rows,
      quotaOpenAlerts: openAlerts,
      totals: {
        tasks: byStatus.rows.reduce((a: number, r: { total: string }) => a + Number(r.total), 0),
        failed: byStatus.rows.find((r: { status: string }) => r.status === 'failed')?.total ?? 0,
        pendingApprovals: approvals.rows.find((r: { status: string }) => r.status === 'pending')?.total ?? 0,
        quotaOpenAlerts: openAlerts,
      },
    }
  }

  // --- 20：定时 Agent（scheduled_tasks 表 + scheduled_run_logs） ---

  async insertScheduledTask(t: { id: string; ownerUserId: string; name: string; agentPresetId: string; schedule: string; taskTemplate: string; nextRunAt: string; timezone: string }): Promise<void> {
    await this.pool!.query(
      `INSERT INTO scheduled_tasks (id, owner_user_id, name, agent_preset_id, schedule, task_template, next_run_at, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [t.id, t.ownerUserId, t.name, t.agentPresetId, t.schedule, t.taskTemplate, t.nextRunAt, t.timezone],
    )
  }

  async listScheduledTasks(ownerUserId?: string): Promise<Record<string, unknown>[]> {
    const res = ownerUserId
      ? await this.pool!.query(`SELECT ${SCHED_TASK_COLS} FROM scheduled_tasks WHERE owner_user_id = $1 ORDER BY created_at DESC`, [ownerUserId])
      : await this.pool!.query(`SELECT ${SCHED_TASK_COLS} FROM scheduled_tasks ORDER BY created_at DESC`)
    return res.rows
  }

  async getScheduledTask(id: string) {
    const res = await this.pool!.query(`SELECT ${SCHED_TASK_COLS} FROM scheduled_tasks WHERE id = $1`, [id])
    return res.rows[0] ?? undefined
  }

  async updateScheduledTask(id: string, p: { status?: string; lastRunAt?: string; lastRunStatus?: string; nextRunAt?: string }): Promise<void> {
    const sets: string[] = []
    const args: unknown[] = []
    if (p.status) { args.push(p.status); sets.push(`status = $${args.length}`) }
    if (p.lastRunAt) { args.push(p.lastRunAt); sets.push(`last_run_at = $${args.length}`) }
    if (p.lastRunStatus) { args.push(p.lastRunStatus); sets.push(`last_run_status = $${args.length}`) }
    if (p.nextRunAt) { args.push(p.nextRunAt); sets.push(`next_run_at = $${args.length}`) }
    if (sets.length === 0) return
    args.push(id)
    await this.pool!.query(`UPDATE scheduled_tasks SET ${sets.join(', ')} WHERE id = $${args.length}`, args)
  }

  async deleteScheduledTask(id: string): Promise<void> {
    await this.pool!.query(`DELETE FROM scheduled_tasks WHERE id = $1`, [id])
  }

  async dueScheduledTasks(now: string): Promise<{ id: string; ownerUserId: string; agentPresetId: string; taskTemplate: string }[]> {
    const res = await this.pool!.query(
      `SELECT id, owner_user_id AS "ownerUserId", agent_preset_id AS "agentPresetId", task_template AS "taskTemplate"
       FROM scheduled_tasks WHERE status = 'active' AND next_run_at <= $1 ORDER BY next_run_at LIMIT 20`,
      [now],
    )
    return res.rows
  }

  // --- 20：定时运行日志（scheduled_run_logs，执行失败告警/任务历史） ---

  async insertScheduledRunLog(scheduledId: string, taskId: string | undefined, status: string, error?: string): Promise<void> {
    await this.pool!.query(
      `INSERT INTO scheduled_run_logs (scheduled_id, task_id, status, error) VALUES ($1, $2, $3, $4)`,
      [scheduledId, taskId ?? null, status, error ?? null],
    )
  }

  async listScheduledRunLogs(f: { scheduledId?: string; status?: string; limit: number }): Promise<Record<string, unknown>[]> {
    const where: string[] = []
    const args: unknown[] = []
    if (f.scheduledId) { args.push(f.scheduledId); where.push(`l.scheduled_id = $${args.length}`) }
    if (f.status) { args.push(f.status); where.push(`l.status = $${args.length}`) }
    args.push(f.limit)
    const res = await this.pool!.query(
      `SELECT l.id, l.scheduled_id AS "scheduledId", s.name AS "name", s.owner_user_id AS "ownerUserId",
              l.task_id AS "taskId", l.status, l.error, l.run_at AS "runAt"
       FROM scheduled_run_logs l
       LEFT JOIN scheduled_tasks s ON s.id = l.scheduled_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY l.run_at DESC LIMIT $${args.length}`,
      args,
    )
    return res.rows
  }

  // --- 13：自定义角色（role_definitions 表） ---

  async listRoleDefinitions(): Promise<Record<string, unknown>[]> {
    const res = await this.pool!.query(
      `SELECT name, permissions, dsh_preset AS "dshPreset", updated_at AS "updatedAt"
       FROM role_definitions ORDER BY name`,
    )
    return res.rows
  }

  async upsertRoleDefinition(r: { name: string; permissions: string[]; dshPreset: string }): Promise<void> {
    await this.pool!.query(
      `INSERT INTO role_definitions (name, permissions, dsh_preset)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET
         permissions = excluded.permissions, dsh_preset = excluded.dsh_preset, updated_at = now()`,
      [r.name, JSON.stringify(r.permissions), r.dshPreset],
    )
  }

  async deleteRoleDefinition(name: string): Promise<boolean> {
    const res = await this.pool!.query(`DELETE FROM role_definitions WHERE name = $1`, [name])
    return (res.rowCount ?? 0) > 0
  }

  // --- 13：users 落 PG（字符串 id；部门名 + 角色覆盖） ---

  async listUsers(): Promise<UserRow[]> {
    const res = await this.pool!.query<UserRow>(
      `SELECT id, external_id AS "externalId", name, COALESCE(dept, '') AS dept, role, status,
              role_override AS "roleOverride"
       FROM users ORDER BY created_at`,
    )
    return res.rows
  }

  async upsertUser(u: UserRow): Promise<void> {
    await this.pool!.query(
      `INSERT INTO users (id, external_id, name, dept, role, status, role_override, idp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'dingtalk')
       ON CONFLICT (id) DO UPDATE SET
         external_id = excluded.external_id,
         name = excluded.name,
         dept = excluded.dept,
         role = excluded.role,
         status = excluded.status,
         role_override = excluded.role_override`,
      [u.id, u.externalId, u.name, u.dept, u.role, u.status, u.roleOverride],
    )
  }
}

export interface UserRow {
  id: string
  externalId: string
  name: string
  dept: string
  role: string
  status: string
  roleOverride: string | null
}
