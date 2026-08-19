import { Module } from '@nestjs/common'
import { AgentsService } from './agents.service.js'
import { AgentsController } from './agents.controller.js'

@Module({
  providers: [AgentsService],
  controllers: [AgentsController],
  exports: [AgentsService],
})
export class AgentsModule {}
