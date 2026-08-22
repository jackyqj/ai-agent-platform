// 定时 Agent API（20 工单）
import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { RequirePermission } from '../common/require-permission.decorator.js'
import { ScheduledTasksService } from './scheduled-tasks.service.js'

@Controller()
export class ScheduledTasksController {
  constructor(private readonly sched: ScheduledTasksService) {}

  /** 创建定时任务 */
  @Post('scheduled-tasks')
  @UseGuards(AuthGuard)
  async create(@Req() req: { user: { sub: string } }, @Body() body: { name: string; schedule: string; taskTemplate: string; agentPresetId?: string; timezone?: string }) {
    if (!body.name || !body.schedule || !body.taskTemplate) {
      throw new HttpException('name/schedule/taskTemplate 必填', HttpStatus.BAD_REQUEST)
    }
    try {
      const t = await this.sched.create({ ownerUserId: req.user.sub, name: body.name, schedule: body.schedule, taskTemplate: body.taskTemplate, agentPresetId: body.agentPresetId, timezone: body.timezone })
      return { task: t, notice: `已创建，下次执行 ${t.nextRunAt}` }
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST)
    }
  }

  /** 我的定时任务 */
  @Get('scheduled-tasks')
  @UseGuards(AuthGuard)
  async mine(@Req() req: { user: { sub: string } }) {
    return { tasks: await this.sched.list(req.user.sub) }
  }

  /** 单个定时任务的运行历史 */
  @Get('scheduled-tasks/:id/runs')
  @UseGuards(AuthGuard)
  async runs(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    const t = await this.sched.get(id)
    if (!t || t.ownerUserId !== req.user.sub) throw new HttpException('not found', HttpStatus.NOT_FOUND)
    return { runs: await this.sched.listRuns({ scheduledId: id, limit: 50 }) }
  }

  /** 手动触发一次 */
  @Post('scheduled-tasks/:id/run-now')
  @UseGuards(AuthGuard)
  async runNow(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    const t = await this.sched.get(id)
    if (!t || t.ownerUserId !== req.user.sub) throw new HttpException('not found', HttpStatus.NOT_FOUND)
    const r = await this.sched.runNow(id)
    return { ok: r.ok, detail: r.detail }
  }

  /** 暂停/恢复 */
  @Post('scheduled-tasks/:id/:action')
  @UseGuards(AuthGuard)
  async toggle(@Req() req: { user: { sub: string } }, @Param('id') id: string, @Param('action') action: 'pause' | 'resume') {
    const t = await this.sched.get(id)
    if (!t || t.ownerUserId !== req.user.sub) throw new HttpException('not found', HttpStatus.NOT_FOUND)
    const updated = await this.sched.setStatus(id, action === 'resume' ? 'active' : 'paused')
    return { task: updated, notice: action === 'resume' ? '已恢复' : '已暂停' }
  }

  /** 删除 */
  @Delete('scheduled-tasks/:id')
  @UseGuards(AuthGuard)
  async remove(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    const t = await this.sched.get(id)
    if (!t || t.ownerUserId !== req.user.sub) throw new HttpException('not found', HttpStatus.NOT_FOUND)
    await this.sched.remove(id)
    return { ok: true }
  }

  /** 管理面：全部定时任务 */
  @Get('admin/scheduled-tasks')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('task.view_all')
  async all() {
    return { tasks: await this.sched.list() }
  }

  /** 管理面：定时运行日志（可筛 status=failed，即执行失败告警通道） */
  @Get('admin/scheduled-runs')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('task.view_all')
  async adminRuns(@Query('status') status?: string, @Query('scheduledId') scheduledId?: string) {
    return { runs: await this.sched.listRuns({ status: status || undefined, scheduledId: scheduledId || undefined, limit: 100 }) }
  }
}
