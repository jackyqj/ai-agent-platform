import { Module } from '@nestjs/common'
import { SessionsService } from './sessions.service.js'
import { SessionsController } from './sessions.controller.js'
import { InstancesModule } from '../instances/instances.module.js'

@Module({
  imports: [InstancesModule],
  providers: [SessionsService],
  controllers: [SessionsController],
  exports: [SessionsService],
})
export class SessionsModule {}
