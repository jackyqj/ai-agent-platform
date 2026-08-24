import { Module } from '@nestjs/common'
import { TasksService } from './tasks.service.js'
import { TasksController } from './tasks.controller.js'
import { KeysModule } from '../keys/keys.module.js'
import { ApprovalsModule } from '../approvals/approval.module.js'
import { ApprovalsController } from '../approvals/approvals.controller.js'
import { QuotaModule } from '../quota/quota.module.js'
import { UsersModule } from '../users/users.module.js'
import { SessionsModule } from '../sessions/sessions.module.js'

@Module({
  imports: [KeysModule, ApprovalsModule, QuotaModule, UsersModule, SessionsModule],
  providers: [TasksService],
  controllers: [TasksController, ApprovalsController],
  exports: [TasksService],
})
export class TasksModule {}
