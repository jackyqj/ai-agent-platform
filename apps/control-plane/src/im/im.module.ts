import { Module, forwardRef } from '@nestjs/common'
import { UsersModule } from '../users/users.module.js'
import { TasksModule } from '../tasks/tasks.module.js'
import { SessionsModule } from '../sessions/sessions.module.js'
import { DingtalkApi } from './dingtalk-api.js'
import { ImBindingsService } from './im-bindings.service.js'
import { ImService } from './im.service.js'
import { DingtalkStreamService } from './dingtalk-stream.service.js'
import { ImController } from './im.controller.js'

@Module({
  imports: [UsersModule, forwardRef(() => TasksModule), SessionsModule],
  controllers: [ImController],
  providers: [DingtalkApi, ImBindingsService, ImService, DingtalkStreamService],
  exports: [ImService, ImBindingsService],
})
export class ImModule {}
