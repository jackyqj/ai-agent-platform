// 任务队列生产端（19 工单）：API → tasks 表(queued) → Redis 队列
// 消费端是独立 Worker 进程（dsh-source/apps/task-worker/src/worker.ts）
import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common'
import { Queue } from 'bullmq'
import { randomUUID } from 'node:crypto'
import { PgStore } from '../store/pg.store.js'
import { AuditStore } from '../common/audit.store.js'
import { ApprovalService } from '../approvals/approval.service.js'
import { QuotaService } from '../quota/quota.service.js'
import { UsersService } from '../users/users.service.js'
import { PermissionPolicyService } from '../common/permission-policy.service.js'
import { SessionsService } from '../sessions/sessions.service.js'

export interface TaskRecord {
  id: string
  userId: string
  agentPresetId: string
  payload: { task: string; permissionMode?: string; sessionId?: string }
  status: 'queued' | 'running' | 'done' | 'failed'
  result?: { finalResponse: string; finishReason?: string | null }
  error?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

@Injectable()
export class TasksService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger('Tasks')
  private queue!: Queue
  private memory = new Map<string, TaskRecord>()

  constructor(
    private readonly pg: PgStore,
    private readonly audit: AuditStore,
    private readonly approvals: ApprovalService,
    private readonly quota: QuotaService,
    private readonly users: UsersService,
    private readonly policies: PermissionPolicyService,
    private readonly sessions: SessionsService,
  ) {}

  private redisUrl(): string {
    return process.env.CP_REDIS_URL ?? 'redis://127.0.0.1:6379'
  }

  private memoryFallback(): boolean {
    return this.pg.pool === null
  }

  onModuleInit() {
    this.queue = new Queue('agent-tasks', { connection: { url: this.redisUrl() } })
    this.logger.log(`task queue ready (redis=${this.redisUrl()})`)
  }

  async onModuleDestroy() {
    await this.queue?.close()
  }

  /** 提交任务：PG 落库（queued）→ 审批门（preset approvalLevel）→ 通过则入队，否则等待审批 */
  async submit(
    userId: string,
    agentPresetId: string,
    taskText: string,
    opts?: { sessionId?: string },
  ): Promise<TaskRecord & { awaitingApproval?: boolean }> {
    const user = this.users.get(userId)
    const permissionMode = this.policies.resolve(user?.role ?? 'employee', user?.dept ?? '')
    const sessionId = opts?.sessionId?.trim() || undefined
    if (sessionId) {
      const s = await this.sessions.get(sessionId)
      if (!s || s.userId !== userId) throw new Error('session not found')
      if (s.status === 'closed') throw new Error('session closed')
    }
    const record: TaskRecord = {
      id: randomUUID(),
      userId,
      agentPresetId,
      payload: { task: taskText, permissionMode, ...(sessionId ? { sessionId } : {}) },
      status: 'queued',
      createdAt: new Date().toISOString(),
    }
    if (!this.memoryFallback()) {
      await this.pg.insertTask(record)
    } else {
      this.memory.set(record.id, record)
    }
    // 配额门（16）：reject 超限 → 抛错拒绝；warn 超限 → 放行（已落可处置告警）。
    // 传用户部门让 dept 级策略（user→dept→all）能被命中。
    const quota = await this.quota.checkAndRecord(userId, user?.dept)
    if (quota.blocked) {
      const message = `配额已用尽：${quota.used}/${quota.budget}（${quota.policy!.period}）`
      // 已落库的 queued 行若不标失败，前端历史会当成「执行中」重复展示
      await this.patchRecord(record.id, { status: 'failed', error: message, finished: true })
      throw new Error(message)
    }
    const gate = await this.approvals.gateTask(userId, agentPresetId, taskText, record.id)
    if (gate.granted) {
      await this.enqueue(record.id)
    }
    await this.audit.append({
      userId,
      sessionId,
      eventType: 'task.submitted',
      payload: { taskId: record.id, agentPresetId, gated: !gate.granted, sessionId },
    })
    return { ...record, awaitingApproval: !gate.granted }
  }

  /** 入队（审批通过后由 ApprovalsController 回调；jobId=taskId） */
  async enqueue(taskId: string): Promise<void> {
    await this.queue.add(
      'run',
      { taskId },
      {
        jobId: taskId,
        attempts: Number(process.env.CP_TASK_ATTEMPTS ?? 3),
        backoff: { type: 'exponential', delay: Number(process.env.CP_TASK_BACKOFF_MS ?? 3000) },
      },
    )
  }

  /** 人工取消：queued → 移除 job + 标记 killed；running → 标记 killed（worker 轮询后终止运行时） */
  async cancel(id: string, byUserId: string): Promise<TaskRecord | undefined> {
    const task = await this.get(id)
    if (!task) return undefined
    if (task.status === 'done' || task.status === 'failed') {
      throw new Error(`task already ${task.status}`)
    }
    await this.patchRecord(id, { status: 'killed', finished: task.status === 'queued' })
    // queued：从队列移除（running 由 worker 轮询接管）
    const job = await this.queue.getJob(id).catch(() => undefined)
    if (job) {
      const state = await job.getState().catch(() => undefined)
      if (state && ['waiting', 'delayed', 'paused'].includes(state)) {
        await job.remove().catch(() => undefined)
      }
    }
    await this.audit.append({ userId: byUserId, eventType: 'task.cancelled', payload: { taskId: id } })
    return this.get(id)
  }

  private async patchRecord(id: string, p: { status?: string; result?: unknown; error?: string; finished?: boolean }) {
    if (!this.memoryFallback()) {
      await this.pg.updateTask(id, p).catch((e) => this.logger.error(`PG updateTask failed: ${(e as Error).message}`))
    } else {
      const t = this.memory.get(id)
      if (t) Object.assign(t, p.status && { status: p.status }, p.result !== undefined && { result: p.result }, p.error !== undefined && { error: p.error })
    }
  }

  async get(id: string): Promise<TaskRecord | undefined> {
    if (!this.memoryFallback()) {
      try {
        const row = await this.pg.getTask(id)
        if (row) return row
      } catch (e) {
        this.logger.error(`PG getTask failed: ${(e as Error).message}`)
      }
    }
    return this.memory.get(id)
  }

  async listForUser(userId: string): Promise<TaskRecord[]> {
    if (!this.memoryFallback()) {
      try {
        return await this.pg.listTasks(userId)
      } catch (e) {
        this.logger.error(`PG listTasks failed: ${(e as Error).message}`)
      }
    }
    return [...this.memory.values()].filter((t) => t.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async listAll(): Promise<TaskRecord[]> {
    if (!this.memoryFallback()) {
      try {
        return await this.pg.listTasks(undefined, 100)
      } catch (e) {
        this.logger.error(`PG listTasks(all) failed: ${(e as Error).message}`)
      }
    }
    return [...this.memory.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
}
