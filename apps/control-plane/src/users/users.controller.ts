import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { Roles } from '../common/roles.decorator.js'
import { AuditStore } from '../common/audit.store.js'
import { InstancesService } from '../instances/instances.service.js'
import { SessionsService } from '../sessions/sessions.service.js'
import { UsersService, type User } from './users.service.js'

@Controller('admin/users')
@UseGuards(AuthGuard)
@Roles('admin')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly instances: InstancesService,
    private readonly audit: AuditStore,
  ) {}

  @Get()
  list() {
    return { users: this.users.list() }
  }

  @Post(':id')
  async patch(
    @Req() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body() body: { status?: string; role?: string; dept?: string },
  ) {
    const before = this.users.get(id)
    if (!before) throw new HttpException('user not found', HttpStatus.NOT_FOUND)
    const role = parseRole(body.role)
    const status = parseStatus(body.status)
    const user = this.users.patch(id, { status, role, dept: body.dept })
    if (status === 'disabled') {
      await this.sessions.closeAllForUser(id)
      await this.instances.stopForUser(id)
    }
    const eventType =
      status === 'disabled'
        ? 'admin.user.disable'
        : status === 'active' && before.status === 'disabled'
          ? 'admin.user.enable'
          : 'admin.user.patch'
    await this.audit.append({
      userId: req.user.sub,
      eventType,
      payload: { targetUserId: id, status, role, dept: body.dept },
    })
    return { user }
  }
}

function parseRole(value: string | undefined): User['role'] | undefined {
  if (value === undefined) return undefined
  switch (value) {
    case 'employee':
    case 'developer':
    case 'admin':
      return value
    default:
      throw new HttpException('invalid role', HttpStatus.BAD_REQUEST)
  }
}

function parseStatus(value: string | undefined): User['status'] | undefined {
  if (value === undefined) return undefined
  switch (value) {
    case 'active':
    case 'disabled':
      return value
    default:
      throw new HttpException('invalid status', HttpStatus.BAD_REQUEST)
  }
}
