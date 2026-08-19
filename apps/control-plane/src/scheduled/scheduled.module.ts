import { Module } from '@nestjs/common'
import { ScheduledTasksService } from './scheduled-tasks.service.js'
import { ScheduledTasksController } from './scheduled-tasks.controller.js'
import { TasksModule } from '../tasks/tasks.module.js'

@Module({
  imports: [TasksModule],
  providers: [ScheduledTasksService],
  controllers: [ScheduledTasksController],
  exports: [ScheduledTasksService],
})
export class ScheduledModule {}
