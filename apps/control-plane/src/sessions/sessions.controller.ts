import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionPolicyService } from '../common/permission-policy.service.js'
import { SessionsService } from './sessions.service.js'

@Controller('sessions')
@UseGuards(AuthGuard)
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly policies: PermissionPolicyService,
  ) {}

  /** 创建/恢复会话（返回 routing token 供代理使用，shell §7） */
  @Post()
  async create(
    @Req() req: { user: { sub: string; role: string; dept: string } },
    @Body() body: { agentPresetId?: string },
  ) {
    const permissionMode = this.policies.resolve(req.user.role, req.user.dept)
    const s = await this.sessions.create(req.user.sub, body.agentPresetId, permissionMode)
    return { sessionId: s.id, routingSecret: s.routingSecret, agentPresetId: s.agentPresetId, permissionMode }
  }

  @Get()
  async list(@Req() req: { user: { sub: string } }) {
    return { sessions: await this.sessions.listForUser(req.user.sub) }
  }

  @Post(':id/close')
  async close(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    await this.sessions.close(id, req.user.sub)
    return { ok: true }
  }

  @Get(':id')
  async get(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    const s = await this.sessions.get(id)
    if (!s || s.userId !== req.user.sub) throw new HttpException('session not found', HttpStatus.NOT_FOUND)
    return { id: s.id, status: s.status, agentPresetId: s.agentPresetId }
  }
}
