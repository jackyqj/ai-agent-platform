import { Module } from '@nestjs/common'
import { InstancesService } from './instances.service.js'
import { InstancesController } from './instances.controller.js'

@Module({
  providers: [InstancesService],
  controllers: [InstancesController],
  exports: [InstancesService],
})
export class InstancesModule {}
