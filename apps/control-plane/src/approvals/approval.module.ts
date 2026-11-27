import { Module, forwardRef } from '@nestjs/common'
import { ApprovalService } from './approval.service.js'
import { AgentsModule } from '../agents/agents.module.js'

@Module({
  imports: [forwardRef(() => AgentsModule)],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalsModule {}
