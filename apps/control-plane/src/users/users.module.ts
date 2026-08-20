import { Module } from '@nestjs/common'
import { UsersService } from './users.service.js'
import { UsersController } from './users.controller.js'
import { SessionsModule } from '../sessions/sessions.module.js'
import { InstancesModule } from '../instances/instances.module.js'

@Module({
  imports: [SessionsModule, InstancesModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
