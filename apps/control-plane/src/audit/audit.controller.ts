import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { Roles } from '../common/roles.decorator.js'
import { AuditStore } from '../common/audit.store.js'

@Controller('admin/audit')
@UseGuards(AuthGuard)
@Roles('admin')
export class AuditController {
  constructor(private readonly audit: AuditStore) {}

  @Get('events')
  async events(
    @Query('userId') userId?: string,
    @Query('eventType') eventType?: string,
    @Query('from') from?: string,
    @Query('limit') limit = '50',
  ) {
    return { events: await this.audit.query({ userId, eventType, from, limit: Math.min(Number(limit) || 50, 200) }) }
  }
}
