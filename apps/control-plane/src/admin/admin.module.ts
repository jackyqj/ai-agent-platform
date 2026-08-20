import { Module } from '@nestjs/common'
import { AgentsModule } from '../agents/agents.module.js'
import { SessionsModule } from '../sessions/sessions.module.js'
import { UsersModule } from '../users/users.module.js'
import { AdminModelsController } from './admin-models.controller.js'
import { AdminSessionsController } from './admin-sessions.controller.js'

@Module({
  imports: [UsersModule, SessionsModule, AgentsModule],
  controllers: [AdminSessionsController, AdminModelsController],
})
export class AdminModule {}
