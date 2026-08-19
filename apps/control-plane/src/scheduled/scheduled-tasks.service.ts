// 定时 Agent（20 工单）：scheduled_tasks 调度器 + 管理
// 调度格式：'daily HH:MM' | 'every <N>m' | 'every <N>h'；每分钟 tick 检查到期 → 复用任务队列（含配额/授权门）
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { PgStore } from '../store/pg.store.js'
import { AuditStore } from '../common/audit.store.js'
import { TasksService } from '../tasks/tasks.service.js'

export interface ScheduledTask {
  id: string
  ownerUserId: string
  name: string
  agentPresetId: string
  schedule: string
  taskTemplate: string
  status: 'active' | 'paused'
  lastRunAt?: string
  nextRunAt?: string
  createdAt: string
}

@Injectable()
export class ScheduledTasksService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger('ScheduledTasks')
  private timer?: NodeJS.Timeout

  constructor(
    private readonly pg: PgStore,
    private readonly audit: AuditStore,
    private readonly tasks: TasksService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.tick().catch((e) => this.logger.error(`tick failed: ${(e as Error).message}`)), 60_000)
    this.logger.log('scheduler ready (tick 60s)')
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  /** cron 解析 → 下次执行时间；非法 schedule 抛错 */
  nextRun(schedule: string, from = new Date()): string {
    const m = /^daily (\d{2}):(\d{2})$/.exec(schedule)
    if (m) {
      const next = new Date(from)
      next.setHours(Number(m[1]), Number(m[2]), 0, 0)
      if (next <= from) next.setDate(next.getDate() + 1)
      return next.toISOString()
    }
    const e = /^every (\d+)([mh])$/.exec(schedule)
    if (e) {
      const n = Number(e[1])
      const ms = e[2] === 'h' ? n * 3600_000 : n * 60_000
      if (n < 1) throw new Error('间隔至少 1')
      return new Date(from.getTime() + ms).toISOString()
    }
    throw new Error(`不支持的调度格式：${schedule}（支持 daily HH:MM 或 every <N>m/h）`)
  }

  async create(input: { ownerUserId: string; name: string; agentPresetId?: string; schedule: string; taskTemplate: string }): Promise<ScheduledTask> {
    const next = this.nextRun(input.schedule) // 校验格式
    const task: ScheduledTask = {
      id: randomUUID(),
      ownerUserId: input.ownerUserId,
      name: input.name,
      agentPresetId: input.agentPresetId ?? 'assistant',
      schedule: input.schedule,
      taskTemplate: input.taskTemplate,
      status: 'active',
      nextRunAt: next,
      createdAt: new Date().toISOString(),
    }
    await this.pg.insertScheduledTask({ id: task.id, ownerUserId: task.ownerUserId, name: task.name, agentPresetId: task.agentPresetId, schedule: task.schedule, taskTemplate: task.taskTemplate, nextRunAt: task.nextRunAt! })
    await this.audit.append({ userId: input.ownerUserId, eventType: 'scheduled.create', payload: { id: task.id, schedule: input.schedule } })
    return task
  }

  async list(ownerUserId?: string): Promise<ScheduledTask[]> {
    return (await this.pg.listScheduledTasks(ownerUserId)) as unknown as ScheduledTask[]
  }

  async get(id: string): Promise<ScheduledTask | undefined> {
    const row = await this.pg.getScheduledTask(id)
    return row ? (row as unknown as ScheduledTask) : undefined
  }

  async setStatus(id: string, status: 'active' | 'paused'): Promise<ScheduledTask | undefined> {
    await this.pg.updateScheduledTask(id, { status })
    if (status === 'active') {
      const t = await this.get(id)
      if (t && !t.nextRunAt) await this.pg.updateScheduledTask(id, { nextRunAt: this.nextRun(t.schedule) })
    }
    return this.get(id)
  }

  async remove(id: string): Promise<boolean> {
    const t = await this.get(id)
    if (!t) return false
    await this.pg.deleteScheduledTask(id)
    await this.audit.append({ userId: t.ownerUserId, eventType: 'scheduled.delete', payload: { id } })
    return true
  }

  /** 手动触发一次（演示/补跑）：直接入队，更新 last_run_at */
  async runNow(id: string): Promise<{ ok: boolean; detail?: string }> {
    const t = await this.get(id)
    if (!t) return { ok: false, detail: 'not found' }
    const r = await this.tasks.submit(t.ownerUserId, t.agentPresetId, t.taskTemplate)
    await this.pg.updateScheduledTask(id, { lastRunAt: new Date().toISOString() })
    await this.audit.append({ userId: t.ownerUserId, eventType: 'scheduled.manual-run', payload: { id } })
    return { ok: true, detail: r.awaitingApproval ? '任务已触发，等待审批' : `任务已入队（${r.id.slice(0, 8)}）` }
  }

  /** 调度器 tick：到期任务 → 入队（复用 submit 的配额/授权门）→ 更新 next/last */
  async tick(): Promise<number> {
    const now = new Date().toISOString()
    const due = await this.pg.dueScheduledTasks(now)
    let fired = 0
    for (const d of due) {
      const t = await this.get(d.id)
      if (!t) continue
      const r = await this.tasks.submit(t.ownerUserId, t.agentPresetId, t.taskTemplate)
      await this.pg.updateScheduledTask(d.id, { lastRunAt: now, nextRunAt: this.nextRun(t.schedule) })
      if (r.awaitingApproval) {
        this.logger.log(`scheduled ${d.id.slice(0, 8)} 触发但等待审批（无有效授权）`)
      } else if (r.error) {
        this.logger.warn(`scheduled ${d.id.slice(0, 8)} 触发失败: ${r.error}`)
      } else {
        fired++
      }
      await this.audit.append({ userId: t.ownerUserId, eventType: 'scheduled.fired', payload: { id: d.id, taskId: r.id } })
    }
    if (due.length) this.logger.log(`scheduled tick: ${fired}/${due.length} 已触发`)
    return fired
  }
}
