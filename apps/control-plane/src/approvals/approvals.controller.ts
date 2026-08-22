// 审批 API（14 工单）：待审批列表/决定/我的审批
import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { RequirePermission } from '../common/require-permission.decorator.js'
import { ApprovalService } from './approval.service.js'
import { TasksService } from '../tasks/tasks.service.js'

@Controller()
export class ApprovalsController {
  constructor(
    private readonly approvals: ApprovalService,
    private readonly tasks: TasksService,
  ) {}

  /** 我的审批记录 */
  @Get('approvals/mine')
  @UseGuards(AuthGuard)
  async mine(@Req() req: { user: { sub: string } }) {
    return { approvals: await this.approvals.listMine(req.user.sub) }
  }

  /** 请求人撤销自己的 pending 审批 */
  @Post('approvals/:id/cancel')
  @UseGuards(AuthGuard)
  async cancel(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    const r = await this.approvals.cancel(id, req.user.sub)
    if (!r.ok) throw new HttpException('审批不存在或不可撤销（仅请求人可撤销 pending）', HttpStatus.BAD_REQUEST)
    return { ok: true, notice: '已撤销' }
  }

  /** 待审批列表（admin/manager） */
  @Get('admin/approvals/pending')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('approval.decide')
  async pending() {
    return { approvals: await this.approvals.listPending() }
  }

  /** 决定：approve | reject（通过后任务入队） */
  @Post('admin/approvals/:id/decide')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('approval.decide')
  async decide(@Req() req: { user: { sub: string; role: string } }, @Param('id') id: string, @Body() body: { approve: boolean }) {
    try {
      const a = await this.approvals.decide(id, body.approve === true, req.user.sub, req.user.role, (taskId) => this.tasks.enqueue(taskId))
      if (!a) throw new HttpException('approval not found', HttpStatus.NOT_FOUND)
      return { approval: a, notice: body.approve ? '已批准' : '已拒绝' }
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST)
    }
  }
}
