import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { RequirePermission } from '../common/require-permission.decorator.js'
import { AuditStore } from '../common/audit.store.js'
import { KbService } from './kb.service.js'
import type { KbUserContext, KbVisibility } from './kb.types.js'

@Controller('admin/kb')
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermission('kb.manage')
export class KbController {
  constructor(
    private readonly kb: KbService,
    private readonly audit: AuditStore,
  ) {}

  @Get('documents')
  async listDocuments() {
    return { documents: await this.kb.listDocuments() }
  }

  @Get('status')
  async status() {
    return this.kb.getStatus()
  }

  @Post('documents')
  async upload(
    @Req() req: { user: { sub: string } },
    @Body() body: { name?: string; contentBase64?: string; visibility?: Partial<KbVisibility> },
  ) {
    if (!body.name || !body.contentBase64) {
      throw new HttpException('name and contentBase64 required', HttpStatus.BAD_REQUEST)
    }
    try {
      const doc = await this.kb.uploadDocument(body.name, body.contentBase64, body.visibility)
      await this.audit.append({
        userId: req.user.sub,
        eventType: 'admin.kb.upload',
        payload: { name: doc.name, sizeBytes: doc.sizeBytes, classification: doc.visibility.classification },
      })
      return { ok: true, document: doc }
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST)
    }
  }

  @Patch('documents/:name/visibility')
  async patchVisibility(
    @Req() req: { user: { sub: string } },
    @Param('name') name: string,
    @Body() visibility: Partial<KbVisibility>,
  ) {
    try {
      const vis = await this.kb.patchVisibility(decodeURIComponent(name), visibility)
      await this.audit.append({
        userId: req.user.sub,
        eventType: 'admin.kb.visibility',
        payload: { name: decodeURIComponent(name), visibility: vis },
      })
      return { ok: true, visibility: vis }
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST)
    }
  }

  @Delete('documents/:name')
  async remove(@Req() req: { user: { sub: string } }, @Param('name') name: string) {
    try {
      await this.kb.deleteDocument(decodeURIComponent(name))
      await this.audit.append({
        userId: req.user.sub,
        eventType: 'admin.kb.delete',
        payload: { name: decodeURIComponent(name) },
      })
      return { ok: true }
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST)
    }
  }

  @Post('ingest')
  async ingest(@Req() req: { user: { sub: string } }) {
    try {
      const r = await this.kb.triggerIngest()
      await this.audit.append({ userId: req.user.sub, eventType: 'admin.kb.ingest', payload: { startedAt: r.startedAt } })
      return r
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.CONFLICT)
    }
  }

  @Get('audit')
  async listKbAudit(@Query('limit') limit = '50') {
    return { events: await this.kb.listAudit(Math.min(Number(limit) || 50, 200)) }
  }

  @Get('documents/:name/exists')
  async exists(@Param('name') name: string) {
    return { exists: await this.kb.documentExists(decodeURIComponent(name)) }
  }

  @Post('search')
  async search(@Body() body: { query?: string; limit?: number; user?: KbUserContext }) {
    if (!body.query?.trim()) throw new HttpException('query required', HttpStatus.BAD_REQUEST)
    try {
      return await this.kb.search(body.query.trim(), body.user, body.limit ?? 5)
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_GATEWAY)
    }
  }
}
