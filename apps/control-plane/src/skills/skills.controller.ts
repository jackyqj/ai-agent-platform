import { Body, Controller, Get, HttpException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import type { AuthUser } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { RequirePermission } from '../common/require-permission.decorator.js'
import { RolesService } from '../common/roles.service.js'
import { NotificationsService } from './notifications.service.js'
import { SkillsService } from './skills.service.js'
import { SkillsError, type ChangeRequestStatus, type FeedbackKind, type SkillActor } from './types.js'

function boom(e: unknown): never {
  if (e instanceof SkillsError) throw new HttpException(e.message, e.httpStatus)
  throw new HttpException((e as Error).message, 400)
}

function actor(user: AuthUser): SkillActor {
  return { id: user.sub, role: user.role, dept: user.dept }
}

@Controller()
export class SkillsController {
  constructor(
    private readonly skills: SkillsService,
    private readonly roles: RolesService,
  ) {}

  @Get('skills')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('skill.create')
  async list(@Req() req: { user: AuthUser }) {
    const a = actor(req.user)
    const includeDraft = (s: { ownerId: string }) => s.ownerId === a.id || this.roles.can(a.role, 'skill.manage')
    const rows = await this.skills.list(a)
    const skills = []
    for (const s of rows) {
      const info = await this.skills.publishedVersionInfo(s.id)
      skills.push(this.skills.publicView(s, {
        includeDraft: includeDraft(s),
        publishedVersion: info.current,
        publishedVersions: info.versions,
      }))
    }
    return { skills }
  }

  @Post('skills')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('skill.create')
  async create(@Req() req: { user: AuthUser }, @Body() body: Parameters<SkillsService['create']>[0]) {
    try {
      const skill = await this.skills.create(body, actor(req.user))
      return { skill: this.skills.publicView(skill, { includeDraft: true }), notice: '已创建草稿' }
    } catch (e) { boom(e) }
  }

  @Get('skills/:id')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('skill.create')
  async get(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    try {
      const a = actor(req.user)
      const skill = await this.skills.get(id, a)
      const sum = await this.skills.feedbackSummary(id, a)
      const includeDraft = skill.ownerId === a.id || this.roles.can(a.role, 'skill.manage')
      return { skill: { ...this.skills.publicView(skill, { includeDraft, mine: sum.mine }), myFeedback: sum.mine } }
    } catch (e) { boom(e) }
  }

  @Patch('skills/:id')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('skill.create')
  async patch(@Req() req: { user: AuthUser }, @Param('id') id: string, @Body() body: Parameters<SkillsService['patch']>[1]) {
    try {
      const skill = await this.skills.patch(id, body, actor(req.user))
      return { skill: this.skills.publicView(skill, { includeDraft: true }), notice: '已保存' }
    } catch (e) { boom(e) }
  }

  @Post('skills/:id/submit')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('skill.create')
  async submit(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    try {
      const skill = await this.skills.submit(id, actor(req.user))
      return { skill: this.skills.publicView(skill), notice: '已提交审核' }
    } catch (e) { boom(e) }
  }

  @Post('skills/:id/archive')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('skill.manage')
  async archive(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    try {
      const skill = await this.skills.archive(id, actor(req.user))
      return { skill: this.skills.publicView(skill), notice: '已下架' }
    } catch (e) { boom(e) }
  }

  @Get('skills/:id/versions')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('skill.create')
  async versions(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    try {
      return { versions: await this.skills.listVersions(id, actor(req.user)) }
    } catch (e) { boom(e) }
  }

  @Post('skills/:id/versions')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('skill.create')
  async addVersion(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { version: string; body?: string; frontmatter?: Record<string, unknown> },
  ) {
    try {
      const skill = await this.skills.addVersion(id, body, actor(req.user))
      return { skill: this.skills.publicView(skill), notice: '已提交新版本' }
    } catch (e) { boom(e) }
  }

  @Post('skills/:id/versions/:vid/review')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('skill.review')
  async review(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Param('vid') vid: string,
    @Body() body: { decision: 'approve' | 'reject'; comment?: string },
  ) {
    try {
      const skill = await this.skills.review(id, vid, body.decision, actor(req.user), body.comment)
      return { skill: this.skills.publicView(skill), notice: body.decision === 'approve' ? '已发布' : '已驳回' }
    } catch (e) { boom(e) }
  }

  @Post('skills/:id/feedback')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('skill.create')
  async feedback(@Req() req: { user: AuthUser }, @Param('id') id: string, @Body() body: { kind: FeedbackKind }) {
    try {
      const skill = await this.skills.setFeedback(id, body.kind, actor(req.user))
      const sum = await this.skills.feedbackSummary(id, actor(req.user))
      return { skill: this.skills.publicView(skill, { mine: sum.mine }), summary: sum }
    } catch (e) { boom(e) }
  }

  @Get('skills/:id/feedback/summary')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('skill.create')
  async feedbackSummary(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    try {
      return { summary: await this.skills.feedbackSummary(id, actor(req.user)) }
    } catch (e) { boom(e) }
  }

  @Get('skills/:id/change-requests')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('skill.create')
  async listCr(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    try {
      return { changeRequests: await this.skills.listChangeRequests(id, actor(req.user)) }
    } catch (e) { boom(e) }
  }

  @Post('skills/:id/change-requests')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('skill.create')
  async addCr(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { versionId?: string; lineNo: number; originalText: string; suggestedText: string; reason?: string },
  ) {
    try {
      return { changeRequest: await this.skills.addChangeRequest(id, body, actor(req.user)), notice: '已提交改稿建议' }
    } catch (e) { boom(e) }
  }

  @Patch('change-requests/:id')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('skill.create')
  async handleCr(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { status: ChangeRequestStatus; reply?: string },
  ) {
    try {
      return { changeRequest: await this.skills.handleChangeRequest(id, body.status, actor(req.user), body.reply) }
    } catch (e) { boom(e) }
  }

  @Get('plugin/skills')
  @UseGuards(AuthGuard)
  async pluginList(@Req() req: { user: AuthUser }) {
    const rows = await this.skills.listPublished(actor(req.user))
    return {
      skills: rows.map((s) => ({
        id: s.id, slug: s.slug, version: s.version, title: s.title, description: s.description,
        tags: s.tags, score: s.score, stars: this.skills.publicView(s).stars,
        currentVersionId: s.currentVersionId,
      })),
    }
  }

  @Get('plugin/skills/:id')
  @UseGuards(AuthGuard)
  async pluginGet(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    try {
      return await this.skills.publishedMarkdown(id, actor(req.user))
    } catch (e) { boom(e) }
  }

  @Get('plugin/skills/:id/versions/:vid')
  @UseGuards(AuthGuard)
  async pluginGetVersion(@Req() req: { user: AuthUser }, @Param('id') id: string, @Param('vid') vid: string) {
    try {
      return await this.skills.publishedMarkdown(id, actor(req.user), vid)
    } catch (e) { boom(e) }
  }
}

@Controller()
export class NotificationsController {
  constructor(private readonly inbox: NotificationsService) {}

  @Get('notifications')
  @UseGuards(AuthGuard)
  async list(@Req() req: { user: AuthUser }) {
    return this.inbox.list(req.user.sub)
  }

  @Post('notifications/read')
  @UseGuards(AuthGuard)
  async read(@Req() req: { user: AuthUser }, @Body() body: { ids?: string[] }) {
    return this.inbox.markRead(req.user.sub, body?.ids)
  }
}
