// 审批服务（14 工单）：授权存储 + 任务前置审批门 + 多级审批（有序审批链）+ 审批超时/撤销
// 语义：preset 的 approvalLevel = none → 免审批；self → 近期授权命中直接放行（记住 X 小时），否则建 pending；
// manager → 按审批链逐个角色审批（默认 ['admin']，可从 agent_presets.approval_chain 配置为多级）。
// 全链通过 → 关联任务入队。decide 校验当前层级审批人角色。超时自动撤销 + 请求人可撤销自己的 pending。
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, forwardRef } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { PgStore } from '../store/pg.store.js'
import { AuditStore } from '../common/audit.store.js'
import { AgentsService } from '../agents/agents.service.js'

export interface ApprovalRequest {
  id: string
  requesterUserId: string
  taskId?: string
  agentPresetId: string
  action: string
  level: 'self' | 'manager'
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  chain?: string[]
  currentLevel?: number
  decidedBy?: string
  decidedAt?: string
  expiresAt?: string
  createdAt: string
}

@Injectable()
export class ApprovalService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger('Approvals')
  private memory = new Map<string, ApprovalRequest>()
  private timer?: NodeJS.Timeout

  constructor(
    private readonly pg: PgStore,
    private readonly audit: AuditStore,
    @Inject(forwardRef(() => AgentsService)) private readonly agents: AgentsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.sweepExpired().catch((e) => this.logger.error(`approval sweep failed: ${(e as Error).message}`)), this.sweepIntervalMs())
    this.logger.log(`approval sweeper ready (ttl=${this.ttlHours()}h, every=${this.sweepIntervalMs()}ms)`)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private ttlHours(): number {
    return Number(process.env.CP_APPROVAL_TTL_HOURS ?? 24)
  }

  private sweepIntervalMs(): number {
    return Number(process.env.CP_APPROVAL_SWEEP_MS ?? 60_000)
  }

  private persist(): boolean {
    return this.pg.pool !== null
  }

  private grantHours(): number {
    return Number(process.env.CP_GRANT_HOURS ?? 24)
  }

  /** 超时清理：最近无进展（COALESCE(decided_at, created_at)）超过 TTL 的 pending 置为 cancelled，逐条审计 approval.expired。 */
  async sweepExpired(): Promise<number> {
    const ttl = this.ttlHours()
    if (!this.persist()) {
      const cutoff = Date.now() - ttl * 3600_000
      let n = 0
      for (const a of this.memory.values()) {
        if (a.status !== 'pending') continue
        const last = a.decidedAt ? new Date(a.decidedAt).getTime() : new Date(a.createdAt).getTime()
        if (last >= cutoff) continue
        a.status = 'cancelled'
        a.decidedAt = new Date().toISOString()
        n++
        await this.audit.append({ userId: a.requesterUserId, eventType: 'approval.expired', payload: { approvalId: a.id, agentPresetId: a.agentPresetId } })
      }
      return n
    }
    const expired = await this.pg.expireOldApprovals(ttl).catch((e) => {
      this.logger.error(`expireOldApprovals failed: ${(e as Error).message}`)
      return [] as { id: string; requesterUserId: string; agentPresetId: string }[]
    })
    for (const r of expired) {
      await this.audit.append({ userId: r.requesterUserId, eventType: 'approval.expired', payload: { approvalId: r.id, agentPresetId: r.agentPresetId } })
    }
    return expired.length
  }

  /** 请求人撤销自己的 pending 审批；返回是否真的撤销（非 pending/不存在则 false）。 */
  async cancel(id: string, requesterUserId: string): Promise<{ ok: boolean }> {
    const a = await this.get(id)
    if (!a || a.requesterUserId !== requesterUserId || a.status !== 'pending') return { ok: false }
    if (this.persist()) {
      if (!(await this.pg.cancelApproval(id))) return { ok: false }
    } else {
      a.status = 'cancelled'
      a.decidedAt = new Date().toISOString()
    }
    await this.audit.append({ userId: requesterUserId, eventType: 'approval.cancelled', payload: { approvalId: id, agentPresetId: a.agentPresetId } })
    return { ok: true }
  }

  private defaultChain(): string[] {
    return ['admin']
  }

  /** 实际生效的审批链：请求快照链有则用，否则默认 ['admin'] */
  private effectiveChain(a: ApprovalRequest): string[] {
    return a.chain?.length ? a.chain : this.defaultChain()
  }

  /** 某角色是否可审批当前层级：等于该层级要求角色，或 admin（后台超管可任一层级） */
  private canDecideLevel(deciderRole: string, levelRole: string): boolean {
    return deciderRole === levelRole || deciderRole === 'admin'
  }

  /**
   * 任务前置审批门：返回 'granted'（直接入队）或 pending 审批单（任务等待）
   * 由 TasksService.submit 调用；审批通过后经 enqueueAfterApproval 入队。
   */
  async gateTask(requesterUserId: string, agentPresetId: string, taskText: string, taskId: string): Promise<{ granted: boolean; approval?: ApprovalRequest }> {
    const preset = await this.agents.get(agentPresetId)
    const level = preset?.approvalLevel ?? 'none'
    if (level === 'none') return { granted: true }

    const action = `执行 ${preset?.name ?? agentPresetId} 任务：${taskText.slice(0, 60)}`
    // 授权存储：self 级近期批准（同一 requester+preset+action）直接放行
    if (level === 'self') {
      const granted = this.persist()
        ? await this.pg.findActiveGrant(requesterUserId, agentPresetId, action).catch(() => false)
        : [...this.memory.values()].some((a) =>
            a.requesterUserId === requesterUserId && a.agentPresetId === agentPresetId &&
            a.action === action && a.status === 'approved' && (!a.expiresAt || a.expiresAt > new Date().toISOString()))
      if (granted) return { granted: true }
    }

    // manager：构建审批链（默认 ['admin']；可配置多级）。把链快照到请求上，前端据此展示层级。
    const chain = level === 'manager'
      ? await this.approvalChainOf(agentPresetId)
      : undefined
    const approval: ApprovalRequest = {
      id: randomUUID(),
      requesterUserId,
      taskId,
      agentPresetId,
      action,
      level: level === 'manager' ? 'manager' : 'self',
      status: 'pending',
      chain,
      currentLevel: 0,
      createdAt: new Date().toISOString(),
    }
    if (this.persist()) {
      await this.pg.insertApproval({ id: approval.id, requesterUserId: approval.requesterUserId, taskId, agentPresetId, action: approval.action, level: approval.level, status: approval.status, chain: approval.chain, currentLevel: approval.currentLevel })
    } else {
      this.memory.set(approval.id, approval)
    }
    await this.audit.append({ userId: requesterUserId, eventType: 'approval.requested', payload: { approvalId: approval.id, agentPresetId } })
    return { granted: false, approval }
  }

  /** 审批链来源：agent_presets.approval_chain（管理员配置），无则默认 ['admin'] */
  private async approvalChainOf(agentPresetId: string): Promise<string[]> {
    if (!this.persist()) return this.defaultChain()
    const chain = await this.pg.getAgentApprovalChain(agentPresetId).catch(() => [] as string[])
    return chain.length ? chain : this.defaultChain()
  }

  async decide(id: string, approve: boolean, decidedBy: string, deciderRole: string, enqueue: (taskId: string) => Promise<void>): Promise<ApprovalRequest | undefined> {
    const a = await this.get(id)
    if (!a) return undefined
    if (a.status !== 'pending') throw new Error(`approval already ${a.status}`)

    const chain = this.effectiveChain(a)
    const levelIdx = a.currentLevel ?? 0
    const levelRole = chain[levelIdx] ?? 'admin'
    if (approve && !this.canDecideLevel(deciderRole, levelRole)) {
      throw new Error(`当前层级需 ${levelRole} 审批（你的角色 ${deciderRole} 不满足）`)
    }

    if (approve) {
      const isLast = levelIdx >= chain.length - 1
      const nextLevel = isLast ? levelIdx : levelIdx + 1
      const status = isLast ? 'approved' : 'pending'
      if (this.persist()) {
        await this.pg.updateApproval(id, { status, decidedBy, currentLevel: nextLevel })
      } else {
        a.status = status
        a.decidedBy = decidedBy
        a.decidedAt = new Date().toISOString()
        a.currentLevel = nextLevel
      }
      await this.audit.append({ userId: decidedBy, eventType: `approval.${isLast ? 'approved' : 'advanced'}`, payload: { approvalId: id, agentPresetId: a.agentPresetId, level: levelIdx + 1, total: chain.length } })
      if (isLast && a.taskId) {
        await enqueue(a.taskId) // 全链通过 → 任务入队
      }
    } else {
      if (this.persist()) {
        await this.pg.updateApproval(id, { status: 'rejected', decidedBy })
      } else {
        a.status = 'rejected'
        a.decidedBy = decidedBy
        a.decidedAt = new Date().toISOString()
      }
      await this.audit.append({ userId: decidedBy, eventType: 'approval.rejected', payload: { approvalId: id, agentPresetId: a.agentPresetId } })
    }
    return this.get(id)
  }

  async get(id: string): Promise<ApprovalRequest | undefined> {
    if (this.persist()) {
      try {
        const row = await this.pg.getApproval(id)
        if (row) return row as unknown as ApprovalRequest
      } catch (e) {
        this.logger.error(`PG getApproval failed: ${(e as Error).message}`)
      }
    }
    return this.memory.get(id)
  }

  async listPending(): Promise<ApprovalRequest[]> {
    if (this.persist()) {
      try {
        return (await this.pg.listApprovals({ status: 'pending', limit: 50 })) as unknown as ApprovalRequest[]
      } catch (e) {
        this.logger.error(`PG listApprovals failed: ${(e as Error).message}`)
      }
    }
    return [...this.memory.values()].filter((a) => a.status === 'pending')
  }

  async listMine(userId: string): Promise<ApprovalRequest[]> {
    if (this.persist()) {
      try {
        return (await this.pg.listApprovals({ requesterUserId: userId, limit: 50 })) as unknown as ApprovalRequest[]
      } catch (e) {
        this.logger.error(`PG listApprovals(mine) failed: ${(e as Error).message}`)
      }
    }
    return [...this.memory.values()].filter((a) => a.requesterUserId === userId)
  }
}
