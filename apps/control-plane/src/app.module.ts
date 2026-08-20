import { Module } from '@nestjs/common'
import { CommonModule } from './common/common.module.js'
import { AuthModule } from './auth/auth.module.js'
import { UsersModule } from './users/users.module.js'
import { SessionsModule } from './sessions/sessions.module.js'
import { InstancesModule } from './instances/instances.module.js'
import { AgentsModule } from './agents/agents.module.js'
import { KeysModule } from './keys/keys.module.js'
import { QuotaModule } from './quota/quota.module.js'
import { ScheduledModule } from './scheduled/scheduled.module.js'
import { TasksModule } from './tasks/tasks.module.js'
import { ImModule } from './im/im.module.js'
import { SecretsModule } from './secrets/secrets.module.js'
import { AdminModule } from './admin/admin.module.js'
import { AuditController } from './audit/audit.controller.js'
import { StatsController } from './stats/stats.controller.js'
import { ProxyController } from './proxy/proxy.controller.js'

@Module({
  imports: [CommonModule, SecretsModule, AuthModule, UsersModule, SessionsModule, InstancesModule, AgentsModule, KeysModule, TasksModule, QuotaModule, ScheduledModule, ImModule, AdminModule],
  controllers: [AuditController, StatsController, ProxyController],
})
export class AppModule {}
