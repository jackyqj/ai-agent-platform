import { Module } from '@nestjs/common'
import { AgentsModule } from '../agents/agents.module.js'
import { AgentsService } from '../agents/agents.service.js'
import { AuditStore } from '../common/audit.store.js'
import { PgStore } from '../store/pg.store.js'
import { SecretsService } from '../secrets/secrets.service.js'
import { TasksModule } from '../tasks/tasks.module.js'
import { TasksService } from '../tasks/tasks.service.js'
import { taskQueueAgentRunner } from './agent-runner.js'
import { CatalogController } from './catalog.controller.js'
import { CatalogService } from './catalog.service.js'

@Module({
  imports: [AgentsModule, TasksModule],
  providers: [
    {
      provide: CatalogService,
      useFactory: (pg: PgStore, audit: AuditStore, secrets: SecretsService, agents: AgentsService, tasks: TasksService) =>
        new CatalogService(pg, audit, secrets, {
          agents,
          runAgent: taskQueueAgentRunner(tasks),
          getAgentTask: async (id) => {
            const t = await tasks.get(id)
            if (!t) return undefined
            return { status: t.status, output: t.result?.finalResponse, error: t.error }
          },
        }),
      inject: [PgStore, AuditStore, SecretsService, AgentsService, TasksService],
    },
  ],
  controllers: [CatalogController],
})
export class CatalogModule {}
