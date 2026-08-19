// 审批服务（14 工单）：授权存储 + 任务前置审批门
// 语义：preset 的 approvalLevel = none → 免审批；self → 近期授权命中直接放行（记住 X 小时），否则建 pending；
// manager → 必须 manager/admin 审批。审批通过 → 关联任务入队。
import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { PgStore } from '../store/pg.store.js'
import { AuditStore } from '../common/audit.store.js'
import { AgentsService } from '../agents/agents.service.js'
import type { TasksService } from '../tasks/tasks.service.js'

export interface ApprovalRequest {
  id: string
  requesterUserId: string
  taskId?: string
  agentPresetId: string
  action: string
  level: 'self' | 'manager'
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  decidedBy?: string
  decidedAt?: string
  expiresAt?: string
  createdAt: string
}

@Injectable()
export class ApprovalService {
  private logger = new Logger('Approvals')
  private memory = new Map<string, ApprovalRequest>()

  constructor(
    private readonly pg: PgStore,
    private readonly audit: AuditStore,
    private readonly agents: AgentsService,
  ) {}

  private persist(): boolean {
    return this.pg.pool !== null
  }

  private grantHours(): number {
    return Number(process.env.CP_GRANT_HOURS ?? 24)
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

    const approval: ApprovalRequest = {
      id: randomUUID(),
      requesterUserId,
      taskId,
      agentPresetId,
      action,
      level: level === 'manager' ? 'manager' : 'self',
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    if (this.persist()) {
      await this.pg.insertApproval(approval)
    } else {
      this.memory.set(approval.id, approval)
    }
    await this.audit.append({ userId: requesterUserId, eventType: 'approval.requested', payload: { approvalId: approval.id, agentPresetId } })
    return { granted: false, approval }
  }

  async decide(id: string, approve: boolean, decidedBy: string, enqueue: (taskId: string) => Promise<void>): Promise<ApprovalRequest | undefined> {
    const a = await this.get(id)
    if (!a) return undefined
    if (a.status !== 'pending') throw new Error(`approval already ${a.status}`)
    const status = approve ? 'approved' : 'rejected'
    if (this.persist()) {
      await this.pg.updateApproval(id, { status, decidedBy })
    } else {
      a.status = status
      a.decidedBy = decidedBy
      a.decidedAt = new Date().toISOString()
    }
    await this.audit.append({ userId: decidedBy, eventType: `approval.${status}`, payload: { approvalId: id, agentPresetId: a.agentPresetId } })
    if (approve && a.taskId) {
      await enqueue(a.taskId) // 审批通过 → 任务入队
    }
    return this.get(id)
  }

  async get(id: string): Promise<ApprovalRequest | undefined> {
    if (this.persist()) {
      try {
        const row = await this.pg.getApproval(id)
        if (row) return row
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
