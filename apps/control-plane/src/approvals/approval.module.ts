import { Module } from '@nestjs/common'
import { ApprovalService } from './approval.service.js'
import { AgentsModule } from '../agents/agents.module.js'

@Module({
  imports: [AgentsModule],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalsModule {}
