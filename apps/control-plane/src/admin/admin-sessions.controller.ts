import { Controller, Get, Param, Query, UseGuards, HttpException, HttpStatus } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { RequirePermission } from '../common/require-permission.decorator.js'
import { AuditStore } from '../common/audit.store.js'
import { SessionsService } from '../sessions/sessions.service.js'
import { UsersService } from '../users/users.service.js'

@Controller('admin/sessions')
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermission('user.manage')
export class AdminSessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly users: UsersService,
    private readonly audit: AuditStore,
  ) {}

  @Get()
  async list(
    @Query('userId') userId?: string,
    @Query('dept') dept?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit = '100',
  ) {
    let rows = await this.sessions.listAdmin({ userId, from, to, limit: Number(limit) || 100 })
    if (dept && !userId) {
      const ids = new Set(this.users.list().filter((u) => u.dept === dept).map((u) => u.id))
      rows = rows.filter((s) => ids.has(s.userId))
    }
    const byId = new Map(this.users.list().map((u) => [u.id, u]))
    return {
      sessions: rows.map((s) => ({
        ...s,
        userName: byId.get(s.userId)?.name,
        dept: byId.get(s.userId)?.dept,
      })),
    }
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const s = await this.sessions.get(id)
    if (!s) throw new HttpException('session not found', HttpStatus.NOT_FOUND)
    const { routingSecret: _secret, ...view } = s
    const events = await this.audit.query({ sessionId: id, limit: 50 })
    return { session: view, events }
  }
}
