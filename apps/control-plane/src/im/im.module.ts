import { Module } from '@nestjs/common'
import { UsersModule } from '../users/users.module.js'
import { TasksModule } from '../tasks/tasks.module.js'
import { DingtalkApi } from './dingtalk-api.js'
import { ImService } from './im.service.js'
import { DingtalkStreamService } from './dingtalk-stream.service.js'
import { ImController } from './im.controller.js'

@Module({
  imports: [UsersModule, TasksModule],
  controllers: [ImController],
  providers: [DingtalkApi, ImService, DingtalkStreamService],
  exports: [ImService],
})
export class ImModule {}
