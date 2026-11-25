// IM 桥接服务（18 工单 + 续）：消息 ↔ 绑定表路由 ↔ D22 会话多轮 + 长任务异步回推
// - 入站：@机器人 → 身份解析 → 绑定路由/会话复用 → tasks.submit(sessionId) → 立即回执
// - 出站：轮询所跟踪任务（30s），done/failed/killed 后主动推结果到原会话
// - 安全：敏感操作白名单拒绝（配合 14 审批走 Web）；身份与 Web SSO 同键（unionId）
// - 与商店会话不互通：仅复用 rpc session 机制，映射表独立于商店会话列表
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { RobotTextMessage } from 'dingtalk-stream'
import { UsersService } from '../users/users.service.js'
import { TasksService } from '../tasks/tasks.service.js'
import { SessionsService } from '../sessions/sessions.service.js'
import { AuditStore } from '../common/audit.store.js'
import { DingtalkApi } from './dingtalk-api.js'
import { ImBindingsService } from './im-bindings.service.js'
import {
  isSensitive,
  parseSwitchCommand,
  buildHelpText,
  buildAmbiguousText,
  SENSITIVE_REPLY,
} from './presets.js'

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
  private recentMsgIds = new Map<string, number>() // msgId → expiryMs（防 Stream 重推）
  private sweepTimer?: NodeJS.Timeout
  private readonly sweepMs = 30_000
  private readonly dedupTtlMs = 10 * 60_000

  constructor(
    private readonly users: UsersService,
    private readonly tasks: TasksService,
    private readonly sessions: SessionsService,
    private readonly bindings: ImBindingsService,
    private readonly api: DingtalkApi,
    private readonly audit: AuditStore,
  ) {}

  onModuleInit() {
    this.sweepTimer = setInterval(() => void this.sweep(), this.sweepMs)
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer)
  }

  private isDuplicateMsg(msgId: string | undefined): boolean {
    if (!msgId) return false
    const now = Date.now()
    if (this.recentMsgIds.size > 2000) {
      for (const [id, exp] of this.recentMsgIds) {
        if (exp <= now) this.recentMsgIds.delete(id)
      }
    }
    const exp = this.recentMsgIds.get(msgId)
    if (exp && exp > now) return true
    this.recentMsgIds.set(msgId, now + this.dedupTtlMs)
    return false
  }

  /** 入站消息处理（由 Stream 回调调用，异常不抛出，保证 ack）
   *  sessionWebhook 缺省时（模拟入口）：跳过回复/跟踪，仍走身份解析 + 任务入队 */
  async handleInbound(m: RobotTextMessage): Promise<void> {
    if (this.isDuplicateMsg(m.msgId)) {
      this.logger.warn(`skip duplicate IM msgId=${m.msgId}`)
      return
    }

    const content = (m.text?.content ?? '').replace(/^@[^\s@]+\s*/, '').trim()
    if (!content) return

    const enabled = await this.bindings.listEnabled()

    if (/^(帮助|菜单|help|menu)\s*$/.test(content)) {
      const help = buildHelpText(
        enabled.map((b) => ({ id: b.presetId, name: b.agentName ?? b.presetId, keywords: b.keywords })),
      )
      if (m.sessionWebhook) await this.api.replyMarkdown(m.sessionWebhook, '帮助', help).catch(() => undefined)
      return
    }

    if (isSensitive(content)) {
      if (m.sessionWebhook) await this.api.replyMarkdown(m.sessionWebhook, '拒绝', SENSITIVE_REPLY).catch(() => undefined)
      return
    }

    const unionId = (await this.api.staffToUnionId(m.senderStaffId).catch(() => undefined)) ?? `ding:${m.senderStaffId}`
    const user =
      this.users.findByExternal(unionId) ??
      (await this.users.upsert({
        externalId: unionId,
        name: m.senderNick ?? m.senderStaffId,
        dept: '未知部门',
      }))

    const switchTo = parseSwitchCommand(content)
    if (switchTo !== undefined) {
      const target = this.bindings.resolveEnabled(switchTo, enabled)
      if (!target) {
        const help = buildHelpText(
          enabled.map((b) => ({ id: b.presetId, name: b.agentName ?? b.presetId, keywords: b.keywords })),
        )
        if (m.sessionWebhook) {
          await this.api
            .replyMarkdown(m.sessionWebhook, '切换失败', `**未找到已开通入口「${switchTo}」**\n\n${help}`)
            .catch(() => undefined)
        }
        return
      }
      if (!m.conversationId) {
        if (m.sessionWebhook) {
          await this.api
            .replyMarkdown(m.sessionWebhook, '切换失败', '缺少会话 ID，无法绑定 Agent。')
            .catch(() => undefined)
        }
        return
      }
      const session = await this.sessions.create(user.id, target.presetId)
      await this.bindings.upsertConversation({
        conversationId: m.conversationId,
        userId: user.id,
        presetId: target.presetId,
        sessionId: session.id,
        convType: m.conversationType,
      })
      this.audit.append({
        userId: user.id,
        sessionId: session.id,
        eventType: 'im.switch',
        payload: { presetId: target.presetId, conv: m.conversationId },
      })
      if (m.sessionWebhook) {
        await this.api
          .replyMarkdown(
            m.sessionWebhook,
            '已切换',
            `**已切换到 ${target.agentName ?? target.presetId}**（\`${target.presetId}\`）\n\n请继续提问。`,
          )
          .catch(() => undefined)
      }
      return
    }

    let presetId: string | undefined
    let sessionId: string | undefined

    const existing = m.conversationId
      ? await this.bindings.getConversation(m.conversationId, user.id)
      : undefined

    if (existing) {
      const sess = await this.sessions.get(existing.sessionId)
      if (sess && sess.status !== 'closed' && sess.userId === user.id) {
        presetId = existing.presetId
        sessionId = existing.sessionId
      }
    }

    if (!presetId) {
      const routed = this.bindings.route(content, enabled)
      if (routed.kind === 'none') {
        if (m.sessionWebhook) {
          await this.api
            .replyMarkdown(
              m.sessionWebhook,
              '未开通',
              buildHelpText([]),
            )
            .catch(() => undefined)
        }
        return
      }
      if (routed.kind === 'ambiguous') {
        if (m.sessionWebhook) {
          await this.api.replyMarkdown(m.sessionWebhook, '请指定', buildAmbiguousText(routed.agents)).catch(() => undefined)
        }
        return
      }
      presetId = routed.presetId
      const session = await this.sessions.create(user.id, presetId)
      sessionId = session.id
      if (m.conversationId) {
        await this.bindings.upsertConversation({
          conversationId: m.conversationId,
          userId: user.id,
          presetId,
          sessionId,
          convType: m.conversationType,
        })
      }
    }

    let taskId: string
    let awaitingApproval = false
    try {
      const task = await this.tasks.submit(user.id, presetId, content, { sessionId })
      taskId = task.id
      awaitingApproval = !!task.awaitingApproval
    } catch (e) {
      this.logger.error(`IM task submit failed: ${(e as Error).message}`)
      if (m.sessionWebhook) {
        await this.api
          .replyMarkdown(
            m.sessionWebhook,
            '提交失败',
            `**❌ 任务提交失败**\n\n${(e as Error).message}\n\n（常见原因：配额已用尽，或 preset 未就绪）`,
          )
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
    this.audit.append({
      userId: user.id,
      sessionId,
      eventType: 'im.inbound',
      payload: {
        taskId,
        presetId,
        sessionId: sessionId ?? null,
        conv: m.conversationId ?? null,
        convType: m.conversationType ?? null,
      },
    })
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
        const body = answer
          ? answer.length > 4000
            ? `${answer.slice(0, 4000)}\n\n_…（结果过长已截断，完整内容见 Web 平台）_`
            : answer
          : '（无文本结果，详见 Web 平台）'
        await this.api.replyMarkdown(conv.sessionWebhook, '任务完成', `**✅ 任务完成**（\`${brief}\`）\n\n${body}`)
      } else if (status === 'failed') {
        await this.api.replyMarkdown(
          conv.sessionWebhook,
          '任务失败',
          `**❌ 任务失败**（\`${brief}\`）\n\n${task?.error ?? '未知错误，请到 Web 平台查看'}`,
        )
      } else {
        await this.api.replyMarkdown(conv.sessionWebhook, '任务已取消', `**⏹ 任务已取消**（\`${brief}\`）`)
      }
    } catch (e) {
      this.logger.error(`IM push result failed: ${(e as Error).message}`)
    }
    this.audit.append({ userId: conv.userId, eventType: 'im.outbound', payload: { taskId, status } })
  }

  trackedCount(): number {
    return this.tracked.size
  }

  trackedTaskIds(): string[] {
    return [...this.tracked.keys()]
  }

  sweepNow(): Promise<void> {
    return this.sweep()
  }

  /** 供测试/调试：伪造一条入站消息（不依赖钉钉 Stream） */
  simulateInbound(m: {
    text: string
    senderStaffId?: string
    senderNick?: string
    sessionWebhook?: string
    conversationId?: string
  }): Promise<void> {
    return this.handleInbound({
      msgId: `sim-${randomUUID()}`,
      senderStaffId: m.senderStaffId ?? 'dev-3001',
      senderNick: m.senderNick ?? '测试',
      conversationId: m.conversationId ?? `cid-test-${randomUUID()}`,
      conversationType: '2',
      msgtype: 'text',
      text: { content: m.text },
      sessionWebhook: m.sessionWebhook,
    } as unknown as RobotTextMessage)
  }
}
