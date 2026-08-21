// IM 桥接服务（18 工单）：消息 ↔ 用户会话路由 + 长任务异步回推
// - 入站：@机器人 → 身份解析（staffId→unionId）→ preset 路由 → tasks.submit → 立即回执
// - 出站：轮询所跟踪任务（30s），done/failed/killed 后主动推结果到原会话
// - 安全：敏感操作白名单拒绝（配合 14 审批走 Web）；身份与 Web SSO 同键（unionId）
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { RobotTextMessage } from 'dingtalk-stream'
import { UsersService } from '../users/users.service.js'
import { TasksService } from '../tasks/tasks.service.js'
import { AuditStore } from '../common/audit.store.js'
import { DingtalkApi } from './dingtalk-api.js'
import { routePreset, isSensitive, HELP_TEXT, SENSITIVE_REPLY } from './presets.js'

interface TrackedConversation {
  sessionWebhook: string
  conversationId?: string
  userId: string
  taskText: string
  presetId: string
}

@Injectable()
export class ImService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger('Im')
  private tracked = new Map<string, TrackedConversation>() // taskId → 会话
  private sweepTimer?: NodeJS.Timeout
  private readonly sweepMs = 30_000

  constructor(
    private readonly users: UsersService,
    private readonly tasks: TasksService,
    private readonly api: DingtalkApi,
    private readonly audit: AuditStore,
  ) {}

  onModuleInit() {
    // 出站轮询：跟踪任务的终态 → 主动推送（worker 直接写 PG，不依赖队列事件）
    this.sweepTimer = setInterval(() => void this.sweep(), this.sweepMs)
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer)
  }

  /** 入站消息处理（由 Stream 回调调用，异常不抛出，保证 ack）
   *  sessionWebhook 缺省时（模拟入口）：跳过回复/跟踪，仍走身份解析 + 任务入队 */
  async handleInbound(m: RobotTextMessage): Promise<void> {
    const content = (m.text?.content ?? '').replace(/^@[^\s@]+\s*/, '').trim()
    if (!content) return

    // 帮助菜单
    if (/^(帮助|菜单|help|menu)\s*$/.test(content)) {
      if (m.sessionWebhook) await this.api.replyMarkdown(m.sessionWebhook, '帮助', HELP_TEXT).catch(() => undefined)
      return
    }
    // 敏感操作守卫
    if (isSensitive(content)) {
      if (m.sessionWebhook) await this.api.replyMarkdown(m.sessionWebhook, '拒绝', SENSITIVE_REPLY).catch(() => undefined)
      return
    }

    // 身份解析：unionId 与 Web SSO 同一身份键；通讯录接口不可用时退化为 ding:staffId
    const unionId = (await this.api.staffToUnionId(m.senderStaffId).catch(() => undefined)) ?? `ding:${m.senderStaffId}`
    const user = this.users.findByExternal(unionId) ?? (await this.users.upsert({
      externalId: unionId,
      name: m.senderNick ?? m.senderStaffId,
      dept: '未知部门', // 组织同步补齐前，角色走 D12 本地覆盖表
    }))

    const presetId = routePreset(content)
    let taskId: string
    let awaitingApproval = false
    try {
      const task = await this.tasks.submit(user.id, presetId, content)
      taskId = task.id
      awaitingApproval = !!task.awaitingApproval
    } catch (e) {
      this.logger.error(`IM task submit failed: ${(e as Error).message}`)
      if (m.sessionWebhook) {
        await this.api
          .replyMarkdown(m.sessionWebhook, '提交失败', `**❌ 任务提交失败**\n\n${(e as Error).message}\n\n（常见原因：配额已用尽，或 preset 未就绪）`)
          .catch(() => undefined)
      }
      return
    }

    if (m.sessionWebhook) {
      this.tracked.set(taskId, {
        sessionWebhook: m.sessionWebhook,
        conversationId: m.conversationId,
        userId: user.id,
        taskText: content,
        presetId,
      })
    }
    this.audit.append({ userId: user.id, eventType: 'im.inbound', payload: { taskId, presetId, conv: m.conversationId ?? null, convType: m.conversationType ?? null } })
    if (m.sessionWebhook) {
      const brief = taskId.slice(0, 8)
      await this.api
        .replyMarkdown(
          m.sessionWebhook,
          '任务已受理',
          `**✅ 已受理**（任务 \`${brief}\`，技能：${presetId}）\n\n> ${content}\n\n完成后我会把结果推到这里。${awaitingApproval ? '\n\n_（该任务需要审批，通过后自动执行）_' : ''}`,
        )
        .catch(() => undefined)
    }
  }

  /** 轮询终态：done/failed/killed → 推送 + 清理 */
  private async sweep(): Promise<void> {
    if (this.tracked.size === 0) return
    for (const [taskId, conv] of [...this.tracked]) {
      const task = await this.tasks.get(taskId).catch(() => undefined)
      if (!task || !['done', 'failed', 'killed'].includes(task.status)) continue
      await this.pushResult(taskId, conv, task.status as 'done' | 'failed' | 'killed')
      this.tracked.delete(taskId)
    }
  }

  private async pushResult(taskId: string, conv: TrackedConversation, status: 'done' | 'failed' | 'killed'): Promise<void> {
    const task = await this.tasks.get(taskId).catch(() => undefined)
    const brief = taskId.slice(0, 8)
    try {
      if (status === 'done') {
        const answer = task?.result?.finalResponse?.trim()
        const body = answer ? (answer.length > 4000 ? `${answer.slice(0, 4000)}\n\n_…（结果过长已截断，完整内容见 Web 平台）_` : answer) : '（无文本结果，详见 Web 平台）'
        await this.api.replyMarkdown(conv.sessionWebhook, '任务完成', `**✅ 任务完成**（\`${brief}\`）\n\n${body}`)
      } else if (status === 'failed') {
        await this.api.replyMarkdown(conv.sessionWebhook, '任务失败', `**❌ 任务失败**（\`${brief}\`）\n\n${task?.error ?? '未知错误，请到 Web 平台查看'}`)
      } else {
        await this.api.replyMarkdown(conv.sessionWebhook, '任务已取消', `**⏹ 任务已取消**（\`${brief}\`）`)
      }
    } catch (e) {
      this.logger.error(`IM push result failed: ${(e as Error).message}`)
    }
    this.audit.append({ userId: conv.userId, eventType: 'im.outbound', payload: { taskId, status } })
  }

  /** 供测试/调试：当前跟踪的会话数 */
  trackedCount(): number {
    return this.tracked.size
  }

  /** 供测试/调试：当前跟踪的任务 id 列表 */
  trackedTaskIds(): string[] {
    return [...this.tracked.keys()]
  }

  /** 供测试/调试：主动触发一次轮询 */
  sweepNow(): Promise<void> {
    return this.sweep()
  }

  /** 供测试/调试：伪造一条入站消息（不依赖钉钉 Stream） */
  simulateInbound(m: { text: string; senderStaffId?: string; senderNick?: string; sessionWebhook?: string }): Promise<void> {
    return this.handleInbound({
      senderStaffId: m.senderStaffId ?? 'dev-3001',
      senderNick: m.senderNick ?? '测试',
      conversationId: `cid-test-${randomUUID()}`,
      msgtype: 'text',
      text: { content: m.text },
      sessionWebhook: m.sessionWebhook,
    } as unknown as RobotTextMessage)
  }
}
