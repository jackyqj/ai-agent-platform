import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { RequirePermission } from '../common/require-permission.decorator.js'
import { AuditStore } from '../common/audit.store.js'

@Controller('admin/audit')
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermission('audit.view')
export class AuditController {
  constructor(private readonly audit: AuditStore) {}

  @Get('events')
  async events(
    @Query('userId') userId?: string,
    @Query('sessionId') sessionId?: string,
    @Query('eventType') eventType?: string,
    @Query('from') from?: string,
    @Query('limit') limit = '50',
  ) {
    return { events: await this.audit.query({ userId, sessionId, eventType, from, limit: Math.min(Number(limit) || 50, 200) }) }
  }
}
