// Agent 商店 API（12 工单）：员工可见列表/详情 + 管理上架/下架/可见性
import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { Roles } from '../common/roles.decorator.js'
import { AgentsService } from './agents.service.js'

@Controller()
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  /** 员工视角：可见的已上架 Agent */
  @Get('agents')
  @UseGuards(AuthGuard)
  async list(@Req() req: { user: { role: string; dept: string } }) {
    return { agents: await this.agents.listFor(req.user.role, req.user.dept) }
  }

  @Get('agents/:id')
  @UseGuards(AuthGuard)
  async get(@Req() req: { user: { role: string; dept: string } }, @Param('id') id: string) {
    const a = await this.agents.get(id)
    if (!a || a.status !== 'published') throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
    // 详情同样遵守可见性（不能绕过列表直接 GET 隐藏 Agent）
    const r = a.visibility.roles
    if (r && r.length && !r.includes(req.user.role)) throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
    const d = a.visibility.departments
    if (d && d.length && !d.includes(req.user.dept)) throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
    return { agent: a }
  }

  /** 管理面：全部（含草稿/下架） */
  @Get('admin/agents')
  @UseGuards(AuthGuard)
  @Roles('admin')
  async all() {
    return { agents: await this.agents.list() }
  }

  /** 上架（发布到商店） */
  @Post('admin/agents/:id/publish')
  @UseGuards(AuthGuard)
  @Roles('admin')
  async publish(@Param('id') id: string) {
    const a = await this.agents.publish(id)
    if (!a) throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
    return { agent: a, notice: '已上架（preset 文件需存在于 preset 根）' }
  }

  /** 下架（新会话不可选，存量不受影响） */
  @Post('admin/agents/:id/unpublish')
  @UseGuards(AuthGuard)
  @Roles('admin')
  async unpublish(@Param('id') id: string) {
    const a = await this.agents.unpublish(id)
    if (!a) throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
    return { agent: a, notice: '已下架' }
  }

  /** 可见性：{roles:[], departments:[]} */
  @Post('admin/agents/:id/visibility')
  @UseGuards(AuthGuard)
  @Roles('admin')
  async visibility(@Param('id') id: string, @Body() body: { roles?: string[]; departments?: string[] }) {
    const a = await this.agents.setVisibility(id, { roles: body.roles, departments: body.departments })
    if (!a) throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
    return { agent: a }
  }

  // ── 员工自建提审 ──

  /** 提审新 Agent（员工；基于模板，复制即作者写入口） */
  @Post('agents/propose')
  @UseGuards(AuthGuard)
  async propose(
    @Req() req: { user: { sub: string } },
    @Body() body: { id: string; name: string; description: string; basedOn?: string },
  ) {
    try {
      const a = await this.agents.propose(
        { id: body.id, name: body.name, description: body.description ?? '', basedOn: body.basedOn ?? 'assistant' },
        req.user.sub,
      )
      return { agent: a, notice: '已提交提审，等待管理员批准' }
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST)
    }
  }

  /** admin 批准：生成 preset 文件并上架 */
  @Post('admin/agents/:id/approve')
  @UseGuards(AuthGuard)
  @Roles('admin')
  async approve(@Param('id') id: string) {
    try {
      const a = await this.agents.approve(id)
      if (!a) throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
      return { agent: a, notice: '已批准：preset 文件已生成并上架' }
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST)
    }
  }

  /** admin 拒绝 */
  @Post('admin/agents/:id/reject')
  @UseGuards(AuthGuard)
  @Roles('admin')
  async reject(@Param('id') id: string) {
    const a = await this.agents.reject(id)
    if (!a) throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
    return { agent: a, notice: '已拒绝（保持 draft）' }
  }
}
