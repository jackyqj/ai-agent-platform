// 任务 API（19 工单）：服务身份触发 + 用户查询 + 管理面
import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { RequirePermission } from '../common/require-permission.decorator.js'
import { ApiKeyGuard, ScopeGuard, type ServiceRequest } from '../keys/api-key.guard.js'
import { TasksService } from './tasks.service.js'
import { RolesService } from '../common/roles.service.js'

@Controller()
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly roles: RolesService,
  ) {}

  /** 服务身份触发（内部系统/IM）：X-API-Key + scope=task:create */
  @Post('service/trigger')
  @UseGuards(ApiKeyGuard, new ScopeGuard('task:create'))
  async trigger(@Req() req: ServiceRequest, @Body() body: { task?: string; agentPresetId?: string }) {
    if (!body.task || !body.task.trim()) {
      throw new HttpException('task text required', HttpStatus.BAD_REQUEST)
    }
    const service = req.service!
    try {
      const record = await this.tasks.submit(service.keyId, body.agentPresetId ?? 'assistant', body.task)
      return { accepted: true, taskId: record.id, status: record.status, by: service.name, awaitingApproval: record.awaitingApproval ?? false }
    } catch (e) {
      const message = (e as Error).message
      // 配额拒绝 → 429；其余业务错误 → 400
      throw new HttpException(message, message.startsWith('配额') ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.BAD_REQUEST)
    }
  }

  /** 登录用户提交任务（商店对话） */
  @Post('tasks')
  @UseGuards(AuthGuard)
  async create(@Req() req: { user: { sub: string } }, @Body() body: { task?: string; agentPresetId?: string; sessionId?: string }) {
    if (!body.task || !body.task.trim()) {
      throw new HttpException('task text required', HttpStatus.BAD_REQUEST)
    }
    try {
      const record = await this.tasks.submit(req.user.sub, body.agentPresetId ?? 'assistant', body.task, {
        sessionId: body.sessionId,
      })
      return { accepted: true, taskId: record.id, status: record.status, awaitingApproval: record.awaitingApproval ?? false }
    } catch (e) {
      const message = (e as Error).message
      throw new HttpException(message, message.startsWith('配额') ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.BAD_REQUEST)
    }
  }

  /** 我的任务列表（用户） */
  @Get('tasks')
  @UseGuards(AuthGuard)
  async mine(@Req() req: { user: { sub: string } }) {
    return { tasks: await this.tasks.listForUser(req.user.sub) }
  }

  /** 任务详情 */
  @Get('tasks/:id')
  @UseGuards(AuthGuard)
  async get(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    const t = await this.tasks.get(id)
    if (!t || t.userId !== req.user.sub) throw new HttpException('task not found', HttpStatus.NOT_FOUND)
    return { task: t }
  }

  /** 人工取消（归属人或 admin） */
  @Post('tasks/:id/cancel')
  @UseGuards(AuthGuard)
  async cancel(@Req() req: { user: { sub: string; role: string } }, @Param('id') id: string) {
    const t = await this.tasks.get(id)
    if (!t) throw new HttpException('task not found', HttpStatus.NOT_FOUND)
    if (t.userId !== req.user.sub && !this.roles.can(req.user.role, 'task.view_all')) {
      throw new HttpException('forbidden', HttpStatus.FORBIDDEN)
    }
    try {
      const updated = await this.tasks.cancel(id, req.user.sub)
      return { task: updated, notice: t.status === 'queued' ? '已从队列移除' : '运行中任务将被终止' }
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST)
    }
  }

  /** 管理面：全部任务 */
  @Get('admin/tasks')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('task.view_all')
  async all() {
    return { tasks: await this.tasks.listAll() }
  }
}
