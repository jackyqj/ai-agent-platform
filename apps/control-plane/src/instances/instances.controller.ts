import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { Roles } from '../common/roles.decorator.js'
import { AuditStore } from '../common/audit.store.js'
import { InstancesService } from './instances.service.js'

@Controller('admin/instances')
@UseGuards(AuthGuard)
@Roles('admin')
export class InstancesController {
  constructor(
    private readonly instances: InstancesService,
    private readonly audit: AuditStore,
  ) {}

  @Get()
  async list() {
    const list = await this.instances.list()
    return { count: await this.instances.count(), instances: list }
  }

  @Post('reap')
  async reap(@Req() req: { user: { sub: string } }) {
    const reaped = await this.instances.reapIdle(Date.now())
    await this.audit.append({ userId: req.user.sub, eventType: 'admin.instance.reap', payload: { reaped } })
    return { ok: true, reaped }
  }

  @Post(':id/stop')
  async stop(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    await this.instances.stop(id)
    await this.audit.append({ userId: req.user.sub, eventType: 'admin.instance.stop', payload: { instanceId: id } })
    return { ok: true, id }
  }
}
