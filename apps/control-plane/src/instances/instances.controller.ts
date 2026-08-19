import { Controller, Get, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { Roles } from '../common/roles.decorator.js'
import { InstancesService } from './instances.service.js'

@Controller('admin/instances')
@UseGuards(AuthGuard)
@Roles('admin')
export class InstancesController {
  constructor(private readonly instances: InstancesService) {}

  @Get()
  async list() {
    const list = await this.instances.list()
    return { count: await this.instances.count(), instances: list }
  }
}
