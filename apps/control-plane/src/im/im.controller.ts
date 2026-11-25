// IM 管理/调试端点（18 工单 + 续）：运行状态 + 绑定列表 + 模拟入站
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { RequirePermission } from '../common/require-permission.decorator.js'
import { ImService } from './im.service.js'
import { ImBindingsService } from './im-bindings.service.js'
import { DingtalkStreamService } from './dingtalk-stream.service.js'
import { loadConfig } from '../config/config.js'

@Controller('admin/im')
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermission('audit.view')
export class ImController {
  constructor(
    private readonly im: ImService,
    private readonly bindings: ImBindingsService,
    private readonly stream: DingtalkStreamService,
  ) {}

  /** IM 运行状态（机器人在线？绑定数？跟踪中的会话数） */
  @Get('status')
  async status() {
    const { clientId } = loadConfig().dingtalk
    const bindingsCount = await this.bindings.countEnabled()
    return {
      enabled: !!clientId,
      streamConnected: this.stream.isConnected(),
      bindingsCount,
      tracked: this.im.trackedCount(),
      trackedTasks: this.im.trackedTaskIds(),
    }
  }

  /** 全部钉钉入口绑定（含未启用） */
  @Get('bindings')
  async listBindings() {
    return { bindings: await this.bindings.listAll() }
  }

  /** 模拟一条 @机器人 消息（可固定 conversationId 验多轮） */
  @Post('simulate')
  async simulate(
    @Body()
    body: {
      text: string
      senderStaffId?: string
      senderNick?: string
      sessionWebhook?: string
      conversationId?: string
    },
  ) {
    if (!body?.text) return { ok: false, error: 'missing text' }
    await this.im.simulateInbound({
      text: body.text,
      senderStaffId: body.senderStaffId,
      senderNick: body.senderNick,
      sessionWebhook: body.sessionWebhook,
      conversationId: body.conversationId,
    })
    return { ok: true }
  }
}
