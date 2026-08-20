import { Controller, Get, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { Roles } from '../common/roles.decorator.js'
import { AgentsService } from '../agents/agents.service.js'
import { describeModelConfig } from './models.js'

@Controller('admin/models')
@UseGuards(AuthGuard)
@Roles('admin')
export class AdminModelsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  async get() {
    const agents = await this.agents.list()
    return describeModelConfig(process.env, agents)
  }
}
