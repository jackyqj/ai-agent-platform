import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Put, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { Roles } from '../common/roles.decorator.js'
import { AuditStore } from '../common/audit.store.js'
import { SecretsService } from './secrets.service.js'

@Controller()
export class SecretsController {
  constructor(
    private readonly secrets: SecretsService,
    private readonly audit: AuditStore,
  ) {}

  @Get('admin/secrets')
  @UseGuards(AuthGuard)
  @Roles('admin')
  async list() {
    return { secrets: await this.secrets.list() }
  }

  @Get('admin/secrets/:ref')
  @UseGuards(AuthGuard)
  @Roles('admin')
  async describe(@Param('ref') ref: string) {
    return this.secrets.describe(ref)
  }

  @Put('admin/secrets/:ref')
  @UseGuards(AuthGuard)
  @Roles('admin')
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
  @UseGuards(AuthGuard)
  @Roles('admin')
  async unset(@Req() req: { user: { sub: string } }, @Param('ref') ref: string) {
    await this.secrets.unset(ref)
    await this.audit.append({ userId: req.user.sub, eventType: 'secrets.unset', payload: { ref } })
    return { ok: true, ref }
  }
}
