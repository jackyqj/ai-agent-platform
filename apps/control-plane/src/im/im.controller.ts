// IM 管理/调试端点（18 工单）：运行状态 + 模拟入站（试点排障用，不依赖钉钉群）
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { ImService } from './im.service.js'
import { DingtalkStreamService } from './dingtalk-stream.service.js'
import { loadConfig } from '../config/config.js'

@Controller('admin/im')
@UseGuards(AuthGuard, new PermissionGuard('audit.view'))
export class ImController {
  constructor(
    private readonly im: ImService,
    private readonly stream: DingtalkStreamService,
  ) {}

  /** IM 运行状态（机器人在线？跟踪中的会话数） */
  @Get('status')
  status() {
    const { clientId } = loadConfig().dingtalk
    return {
      enabled: !!clientId,
      streamConnected: this.stream.isConnected(),
      tracked: this.im.trackedCount(),
      trackedTasks: this.im.trackedTaskIds(),
    }
  }

  /** 模拟一条 @机器人 消息（text 必填；sessionWebhook 缺省则只走任务入队，不回推） */
  @Post('simulate')
  async simulate(@Body() body: { text: string; senderStaffId?: string; senderNick?: string; sessionWebhook?: string }) {
    if (!body?.text) return { ok: false, error: 'missing text' }
    await this.im.simulateInbound({ text: body.text, senderStaffId: body.senderStaffId, senderNick: body.senderNick, sessionWebhook: body.sessionWebhook })
    return { ok: true }
  }
}
