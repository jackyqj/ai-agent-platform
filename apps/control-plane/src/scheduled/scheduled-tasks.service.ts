// 定时 Agent（20 工单补强）：scheduled_tasks 调度器 + 管理
// 调度格式：'daily HH:MM' | 'every <N>m' | 'every <N>h' | 5 段 cron（'分 时 日 月 周'，cron-parser 解析）
// 时区：任务级 timezone（默认 Asia/Shanghai），daily 与 cron 按该时区计算；every 为时长、与时区无关。
// 失败告警：每次触发写 scheduled_run_logs（fired/failed）+ 更新 last_run_at/last_run_status + 审计 scheduled.failure。
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { CronExpressionParser } from 'cron-parser'
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
  timezone?: string
  lastRunAt?: string
  lastRunStatus?: SchedRunStatus
  nextRunAt?: string
  createdAt: string
}

/** 一次触发的结果：fired=已入队执行 / awaiting=触发但等待审批（未真正入队执行）/ failed=触发失败 */
export type SchedRunStatus = 'fired' | 'awaiting' | 'failed'

export interface ScheduledRunLog {
  id: string
  scheduledId: string
  name?: string
  ownerUserId?: string
  taskId?: string
  status: SchedRunStatus
  error?: string
  runAt: string
}

export const DEFAULT_SCHED_TZ = 'Asia/Shanghai'

/** 目标时区在给定 UTC 时刻的偏移量（毫秒）：UTC = 本地墙钟 + offset。 */
function tzOffsetMs(timeZone: string, utc: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(dtf.formatToParts(utc).find((p) => p.type === t)?.value)
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUTC - utc.getTime()
}

/** 在指定时区里求「下一个 h:m」的 UTC 时刻。固定偏移时区精确；DST 转换日可能出现 1 小时级近似。 */
function nextDailyInTz(hour: number, minute: number, timeZone: string, from: Date): Date {
  const fromOffset = tzOffsetMs(timeZone, from)
  const wall = new Date(from.getTime() + fromOffset) // 近似墙钟（用 from 时刻的偏移）
  let day = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate())
  for (let i = 0; i < 3; i++) {
    const offset = tzOffsetMs(timeZone, new Date(day)) // 当天偏移
    const candidate = new Date(day + (hour * 3600_000 + minute * 60_000) - offset)
    if (candidate > from) return candidate
    day += 24 * 3600_000
  }
  // 兜底：再往后 7 天（不应出现）
  return new Date(from.getTime() + 7 * 24 * 3600_000)
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

  /**
   * 解析下一次执行时间。格式：daily HH:MM（时区感知）| every <N>m/h（时长）
   * | 5 段 cron（cron-parser，时区感知）。非法 schedule 抛错。
   */
  nextRun(schedule: string, from = new Date(), timezone = DEFAULT_SCHED_TZ): string {
    const s = schedule.trim()
    const daily = /^daily (\d{2}):(\d{2})$/.exec(s)
    if (daily) {
      return nextDailyInTz(Number(daily[1]), Number(daily[2]), timezone, from).toISOString()
    }
    const every = /^every (\d+)([mh])$/.exec(s)
    if (every) {
      const n = Number(every[1])
      if (n < 1) throw new Error('间隔至少 1')
      const ms = every[2] === 'h' ? n * 3600_000 : n * 60_000
      return new Date(from.getTime() + ms).toISOString()
    }
    try {
      return CronExpressionParser.parse(s, { currentDate: from, tz: timezone }).next().toDate().toISOString()
    } catch {
      throw new Error(`不支持的调度格式：${schedule}（支持 daily HH:MM / every <N>m/h / cron：分 时 日 月 周）`)
    }
  }

  async create(input: { ownerUserId: string; name: string; agentPresetId?: string; schedule: string; taskTemplate: string; timezone?: string }): Promise<ScheduledTask> {
    const timezone = input.timezone || DEFAULT_SCHED_TZ
    this.assertTimezone(timezone)
    const next = this.nextRun(input.schedule, new Date(), timezone) // 校验格式
    const task: ScheduledTask = {
      id: randomUUID(),
      ownerUserId: input.ownerUserId,
      name: input.name,
      agentPresetId: input.agentPresetId ?? 'assistant',
      schedule: input.schedule,
      taskTemplate: input.taskTemplate,
      status: 'active',
      timezone,
      nextRunAt: next,
      createdAt: new Date().toISOString(),
    }
    await this.pg.insertScheduledTask({ id: task.id, ownerUserId: task.ownerUserId, name: task.name, agentPresetId: task.agentPresetId, schedule: task.schedule, taskTemplate: task.taskTemplate, nextRunAt: task.nextRunAt!, timezone })
    await this.audit.append({ userId: input.ownerUserId, eventType: 'scheduled.create', payload: { id: task.id, schedule: input.schedule, timezone } })
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
      if (t && !t.nextRunAt) await this.pg.updateScheduledTask(id, { nextRunAt: this.nextRun(t.schedule, new Date(), t.timezone) })
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

  private assertTimezone(timezone: string): void {
    if (timezone === 'UTC') return
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    } catch {
      throw new Error(`无效时区：${timezone}`)
    }
  }

  /** 记录一次触发结果：写运行日志 + 更新 last_run_at/last_run_status；失败则审计 scheduled.failure（fail-soft）。 */
  private async recordRun(id: string, ownerUserId: string, taskId: string | undefined, status: SchedRunStatus, error?: string): Promise<void> {
    await this.pg.insertScheduledRunLog(id, taskId, status, error)
    await this.pg.updateScheduledTask(id, { lastRunAt: new Date().toISOString(), lastRunStatus: status })
    if (status === 'failed') {
      await this.audit.append({ userId: ownerUserId, eventType: 'scheduled.failure', payload: { scheduledId: id, error } })
    }
  }

  /** 手动触发一次（演示/补跑）：直接入队，记录运行日志；submit 抛错则记为失败；等待审批记为 awaiting。 */
  async runNow(id: string): Promise<{ ok: boolean; detail?: string }> {
    const t = await this.get(id)
    if (!t) return { ok: false, detail: 'not found' }
    try {
      const r = await this.tasks.submit(t.ownerUserId, t.agentPresetId, t.taskTemplate)
      await this.recordRun(id, t.ownerUserId, r.id, r.awaitingApproval ? 'awaiting' : 'fired')
      await this.audit.append({ userId: t.ownerUserId, eventType: 'scheduled.manual-run', payload: { id } })
      return { ok: true, detail: r.awaitingApproval ? '任务已触发，等待审批' : `任务已入队（${r.id.slice(0, 8)}）` }
    } catch (e) {
      await this.recordRun(id, t.ownerUserId, undefined, 'failed', (e as Error).message)
      this.logger.warn(`scheduled ${id.slice(0, 8)} run-now failed: ${(e as Error).message}`)
      return { ok: false, detail: `触发失败：${(e as Error).message}` }
    }
  }

  /** 调度器 tick：到期任务 → 入队（复用 submit 的配额/授权门）→ 更新 next/last + 运行日志 */
  async tick(): Promise<number> {
    const now = new Date().toISOString()
    const due = await this.pg.dueScheduledTasks(now)
    let fired = 0
    for (const d of due) {
      const t = await this.get(d.id)
      if (!t) continue
      try {
        const r = await this.tasks.submit(t.ownerUserId, t.agentPresetId, t.taskTemplate)
        if (r.awaitingApproval) {
          await this.recordRun(d.id, t.ownerUserId, r.id, 'awaiting')
          this.logger.log(`scheduled ${d.id.slice(0, 8)} 触发但等待审批（无有效授权）`)
        } else {
          await this.recordRun(d.id, t.ownerUserId, r.id, 'fired')
          fired++
        }
        await this.audit.append({ userId: t.ownerUserId, eventType: 'scheduled.fired', payload: { id: d.id, taskId: r.id } })
      } catch (e) {
        await this.recordRun(d.id, t.ownerUserId, undefined, 'failed', (e as Error).message)
        this.logger.warn(`scheduled ${d.id.slice(0, 8)} 触发失败: ${(e as Error).message}`)
      } finally {
        await this.pg.updateScheduledTask(d.id, { nextRunAt: this.nextRun(t.schedule, new Date(), t.timezone) })
      }
    }
    if (due.length) this.logger.log(`scheduled tick: ${fired}/${due.length} 已触发`)
    return fired
  }

  async listRuns(f: { scheduledId?: string; status?: string; limit?: number }): Promise<ScheduledRunLog[]> {
    return (await this.pg.listScheduledRunLogs({ scheduledId: f.scheduledId, status: f.status, limit: f.limit ?? 50 })) as unknown as ScheduledRunLog[]
  }
}
