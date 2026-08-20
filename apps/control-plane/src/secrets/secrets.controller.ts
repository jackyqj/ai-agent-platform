import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Put, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { RequirePermission } from '../common/require-permission.decorator.js'
import { AuditStore } from '../common/audit.store.js'
import { SecretsService } from './secrets.service.js'

@Controller()
export class SecretsController {
  constructor(
    private readonly secrets: SecretsService,
    private readonly audit: AuditStore,
  ) {}

  @Get('admin/secrets')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('secrets.manage')
  async list() {
    return { secrets: await this.secrets.list() }
  }

  @Get('admin/secrets/:ref')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('secrets.manage')
  async describe(@Param('ref') ref: string) {
    return this.secrets.describe(ref)
  }

  @Put('admin/secrets/:ref')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('secrets.manage')
  async set(
    @Req() req: { user: { sub: string } },
    @Param('ref') ref: string,
    @Body() body: { value?: string },
  ) {
    if (!body.value) throw new HttpException('value required', HttpStatus.BAD_REQUEST)
    try {
      await this.secrets.set(ref, body.value, req.user.sub)
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST)
    }
    await this.audit.append({ userId: req.user.sub, eventType: 'secrets.set', payload: { ref } })
    return { ok: true, ref }
  }

  @Delete('admin/secrets/:ref')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('secrets.manage')
  async unset(@Req() req: { user: { sub: string } }, @Param('ref') ref: string) {
    await this.secrets.unset(ref)
    await this.audit.append({ userId: req.user.sub, eventType: 'secrets.unset', payload: { ref } })
    return { ok: true, ref }
  }
}
