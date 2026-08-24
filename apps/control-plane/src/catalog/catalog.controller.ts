import { Body, Controller, Delete, Get, HttpException, Param, Post, Put, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { RequirePermission } from '../common/require-permission.decorator.js'
import { RolesService } from '../common/roles.service.js'
import { CatalogService } from './catalog.service.js'
import { CatalogError, type CatalogTool, type Connector, type GraphSpec, type Visibility } from './types.js'

function boom(e: unknown): never {
  if (e instanceof CatalogError) throw new HttpException(e.message, e.httpStatus)
  throw new HttpException((e as Error).message, 400)
}

@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly roles: RolesService,
  ) {}

  @Get('admin/connectors')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('connector.manage')
  async connectors() {
    return { connectors: await this.catalog.listConnectors() }
  }

  @Put('admin/connectors/:id')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('connector.manage')
  async putConnector(@Req() req: { user: { sub: string } }, @Param('id') id: string, @Body() body: Omit<Connector, 'id' | 'updatedAt' | 'status'>) {
    try {
      return { connector: await this.catalog.putConnector({ ...body, id }, req.user.sub) }
    } catch (e) { boom(e) }
  }

  @Post('admin/connectors/:id/publish')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('connector.manage')
  async publishConnector(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    try {
      return { connector: await this.catalog.publishConnector(id, req.user.sub), notice: '已发布连接器' }
    } catch (e) { boom(e) }
  }

  @Delete('admin/connectors/:id')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('connector.manage')
  async deleteConnector(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    try {
      await this.catalog.deleteConnector(id, req.user.sub)
      return { notice: '已删除' }
    } catch (e) { boom(e) }
  }

  @Get('admin/tools')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('connector.manage')
  async tools() {
    return { tools: await this.catalog.listTools() }
  }

  @Put('admin/tools/:id')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('connector.manage')
  async putTool(@Req() req: { user: { sub: string } }, @Param('id') id: string, @Body() body: Omit<CatalogTool, 'id' | 'updatedAt' | 'status'>) {
    try {
      return { tool: await this.catalog.putTool({ ...body, id }, req.user.sub) }
    } catch (e) { boom(e) }
  }

  @Post('admin/tools/:id/publish')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('connector.manage')
  async publishTool(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    try {
      return { tool: await this.catalog.publishTool(id, req.user.sub), notice: '已发布工具' }
    } catch (e) { boom(e) }
  }

  @Delete('admin/tools/:id')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('connector.manage')
  async deleteTool(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    try {
      await this.catalog.deleteTool(id, req.user.sub)
      return { notice: '已删除' }
    } catch (e) { boom(e) }
  }

  @Get('admin/graphs')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('graph.edit')
  async graphsAdmin() {
    return { graphs: await this.catalog.listGraphsAdmin() }
  }

  @Get('admin/graphs/:id')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('graph.edit')
  async graphAdmin(@Param('id') id: string) {
    try {
      return { graph: await this.catalog.getGraphAdmin(id) }
    } catch (e) { boom(e) }
  }

  @Get('admin/graphs/:id/revisions')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('graph.edit')
  async graphRevisions(@Param('id') id: string) {
    try {
      return { revisions: await this.catalog.listGraphRevisions(id) }
    } catch (e) { boom(e) }
  }

  @Post('admin/graphs/:id/rollback')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('graph.publish')
  async rollbackGraph(@Req() req: { user: { sub: string } }, @Param('id') id: string, @Body() body: { toVersion: number }) {
    try {
      return { graph: await this.catalog.rollbackGraph(id, body.toVersion, req.user.sub), notice: `已回滚到 v${body.toVersion}` }
    } catch (e) { boom(e) }
  }

  @Post('admin/graphs/:id/trial')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('graph.edit')
  async trialGraph(
    @Req() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body() body: { input?: Record<string, unknown>; task?: string },
  ) {
    try {
      const input = body.input ?? { task: body.task ?? '' }
      return { run: await this.catalog.trialRunGraph(id, req.user.sub, input) }
    } catch (e) { boom(e) }
  }

  @Get('admin/graphs/:id/latest-run')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('graph.edit')
  async latestRun(@Param('id') id: string) {
    try {
      return { run: await this.catalog.latestRun(id) ?? null }
    } catch (e) { boom(e) }
  }

  @Put('admin/graphs/:id')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('graph.edit')
  async putGraph(
    @Req() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body() body: { name: string; description?: string; visibility?: Visibility; spec: GraphSpec },
  ) {
    try {
      return { graph: await this.catalog.putGraph({ id, ...body }, req.user.sub), notice: '已保存草稿' }
    } catch (e) { boom(e) }
  }

  @Post('admin/graphs/:id/publish')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('graph.publish')
  async publishGraph(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    try {
      return { graph: await this.catalog.publishGraph(id, req.user.sub), notice: '已上架组合产品' }
    } catch (e) { boom(e) }
  }

  @Post('admin/graphs/:id/unpublish')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('graph.publish')
  async unpublishGraph(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    try {
      return { graph: await this.catalog.unpublishGraph(id, req.user.sub), notice: '已下架' }
    } catch (e) { boom(e) }
  }

  @Get('graphs')
  @UseGuards(AuthGuard)
  async graphs(@Req() req: { user: { role: string; dept: string } }) {
    return { graphs: await this.catalog.listGraphsFor(req.user.role, req.user.dept) }
  }

  @Get('graphs/:id')
  @UseGuards(AuthGuard)
  async graph(@Req() req: { user: { role: string; dept: string } }, @Param('id') id: string) {
    try {
      const g = await this.catalog.getPublishedGraph(id, req.user.role, req.user.dept)
      return { graph: { id: g.id, name: g.name, description: g.description, version: g.version } }
    } catch (e) { boom(e) }
  }

  @Post('graphs/:id/run')
  @UseGuards(AuthGuard)
  async run(
    @Req() req: { user: { sub: string; role: string; dept: string } },
    @Param('id') id: string,
    @Body() body: { input?: Record<string, unknown>; task?: string },
  ) {
    try {
      const input = body.input ?? { task: body.task ?? '' }
      const run = await this.catalog.runGraph(id, req.user.sub, req.user.role, req.user.dept, input)
      return { run }
    } catch (e) { boom(e) }
  }

  @Get('graph-runs/:id')
  @UseGuards(AuthGuard)
  async runGet(@Req() req: { user: { sub: string; role: string } }, @Param('id') id: string) {
    try {
      return { run: await this.catalog.getRun(id, req.user.sub, this.roles.can(req.user.role, 'graph.publish')) }
    } catch (e) { boom(e) }
  }
}
