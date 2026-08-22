// Agent 商店 API（12 工单）+ 编排 API（agent-orchestration-design.md §8）
import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Put, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { RequirePermission } from '../common/require-permission.decorator.js'
import { can, type Role } from '../common/permissions.js'
import { AgentsService, SpecValidationError, TemplateHasNoSpecError, type AgentPreset } from './agents.service.js'
import type { AgentSpec } from './types.js'

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
    const r = a.visibility.roles
    if (r && r.length && !r.includes(req.user.role)) throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
    const d = a.visibility.departments
    if (d && d.length && !d.includes(req.user.dept)) throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
    return { agent: a }
  }

  /** 管理面：全部（含草稿/下架） */
  @Get('admin/agents')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('agent.publish')
  async all() {
    return { agents: await this.agents.list() }
  }

  /** 管理员新建：基于模板复制已发布 spec 成草稿（免批准，可直接编排） */
  @Post('admin/agents')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('agent.publish')
  async create(@Req() req: { user: { sub: string } }, @Body() body: { id: string; name: string; description: string; basedOn?: string }) {
    try {
      const a = await this.agents.propose(
        { id: body.id, name: body.name, description: body.description ?? '', basedOn: body.basedOn ?? 'assistant' },
        req.user.sub,
      )
      return { agent: a, notice: '已创建草稿，可进入编排' }
    } catch (e) {
      if (e instanceof TemplateHasNoSpecError) {
        throw new HttpException(e.message, HttpStatus.UNPROCESSABLE_ENTITY)
      }
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST)
    }
  }

  /** 删除 Agent：删 PG 行 + 修订 + preset 文件（存量会话靠 DSH standing mount 保留） */
  @Delete('admin/agents/:id')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('agent.publish')
  async remove(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    await this.agents.removeAgent(id, req.user.sub)
    return { notice: '已删除' }
  }

  // ── 编排 API（agent-orchestration-design.md §8）──

  /** 能力目录：模型 + MCP 勾选清单 + host-plane 只读项 */
  @Get('capabilities')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('agent.edit')
  async capabilities() {
    return this.agents.capabilities()
  }

  /** 编排 spec 视图；draft（有未发布工作副本）对无 agent.edit 权限者隐藏 */
  @Get('agents/:id/spec')
  @UseGuards(AuthGuard)
  async getSpec(@Req() req: { user: { role: string } }, @Param('id') id: string) {
    try {
      const view = await this.agents.getSpec(id)
      if (view.dirty && !can(req.user.role as Role, 'agent.edit')) {
        throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
      }
      return view
    } catch (e) {
      if (e instanceof HttpException) throw e
      throw new HttpException((e as Error).message, HttpStatus.NOT_FOUND)
    }
  }

  /** 保存工作副本（不发布、不 bump version、不写文件） */
  @Put('agents/:id/spec')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('agent.edit')
  async putSpec(
    @Req() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body() body: { spec: AgentSpec; expectedUpdatedAt?: string },
  ) {
    try {
      await this.agents.putSpec(id, body.spec, req.user.sub, body.expectedUpdatedAt)
      return { notice: '已保存草稿' }
    } catch (e) {
      if (e instanceof SpecValidationError) {
        throw new HttpException({ errors: e.result.ok === false ? e.result.errors : [] }, HttpStatus.UNPROCESSABLE_ENTITY)
      }
      throw new HttpException((e as Error).message, HttpStatus.CONFLICT)
    }
  }

  /** 编辑器实时预览：校验 + 编译后的 YAML（不保存） */
  @Post('agents/:id/validate')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('agent.edit')
  async validate(@Body() body: { spec: AgentSpec }) {
    return this.agents.previewSpec(body.spec)
  }

  /** 发布：compile → PG 事务（修订 + 投影列 + version+1）→ 原子写文件 */
  @Post('admin/agents/:id/publish')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('agent.publish')
  async publish(
    @Req() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body() body: { expectedVersion?: number },
  ) {
    let current: AgentPreset | undefined
    try {
      current = await this.agents.get(id)
      if (!current) throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
      const r = await this.agents.publishSpec(id, body.expectedVersion ?? current.version, req.user.sub)
      return { agent: r.agent, version: r.version, notice: '已发布' }
    } catch (e) {
      if (e instanceof SpecValidationError) {
        throw new HttpException({ errors: e.result.ok === false ? e.result.errors : [] }, HttpStatus.UNPROCESSABLE_ENTITY)
      }
      // 乐观并发冲突（expectedVersion 过期）才返 409；
      // 其余（含 PG 已 commit 后文件写失败）是服务端故障，返 500（漂移由 P3 告警兜底）。
      if (e instanceof Error && /version conflict/.test(e.message)) {
        throw new HttpException((e as Error).message, HttpStatus.CONFLICT)
      }
      throw new HttpException((e as Error).message, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  /** 下架（新会话不可选，存量不受影响） */
  @Post('admin/agents/:id/unpublish')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('agent.publish')
  async unpublish(@Param('id') id: string) {
    const a = await this.agents.unpublish(id)
    if (!a) throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
    return { agent: a, notice: '已下架' }
  }

  /** 可见性：{roles:[], departments:[]} */
  @Post('admin/agents/:id/visibility')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('agent.publish')
  async visibility(@Param('id') id: string, @Body() body: { roles?: string[]; departments?: string[] }) {
    const a = await this.agents.setVisibility(id, { roles: body.roles, departments: body.departments })
    if (!a) throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
    return { agent: a }
  }

  /** 修订列表 */
  @Get('admin/agents/:id/revisions')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('agent.publish')
  async revisions(@Param('id') id: string) {
    return { revisions: await this.agents.listRevisions(id) }
  }

  /** 漂移告警：磁盘 YAML 与最新修订的对照结果（§13 P3） */
  @Get('admin/agents/drift')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('agent.publish')
  async drift() {
    const drifts = await this.agents.checkDrift()
    return { drifts, drifted: drifts.some((d) => d.drifted) }
  }

  /** 回滚：把目标修订 spec 作为工作副本再 publish（新版本） */
  @Post('admin/agents/:id/rollback')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('agent.publish')
  async rollback(@Req() req: { user: { sub: string } }, @Param('id') id: string, @Body() body: { toVersion: number }) {
    try {
      const r = await this.agents.rollback(id, body.toVersion, req.user.sub)
      return { agent: r.agent, version: r.version, notice: `已回滚到 v${body.toVersion}（新版本 v${r.version}）` }
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST)
    }
  }

  // ── 员工自建提审 ──

  @Post('agents/propose')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('agent.propose')
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
      if (e instanceof TemplateHasNoSpecError) {
        throw new HttpException((e as Error).message, HttpStatus.UNPROCESSABLE_ENTITY)
      }
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST)
    }
  }

  @Post('admin/agents/:id/approve')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('agent.approve')
  async approve(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    try {
      const a = await this.agents.approve(id, req.user.sub)
      if (!a) throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
      return { agent: a, notice: '已批准：spec 已发布' }
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST)
    }
  }

  @Post('admin/agents/:id/reject')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('agent.approve')
  async reject(@Param('id') id: string) {
    const a = await this.agents.reject(id)
    if (!a) throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
    return { agent: a, notice: '已拒绝（保持 draft）' }
  }
}
