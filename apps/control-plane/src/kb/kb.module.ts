import { Module } from '@nestjs/common'
import { KbController } from './kb.controller.js'
import { KbEmployeeController } from './kb-employee.controller.js'
import { KbService } from './kb.service.js'

@Module({
  providers: [KbService],
  controllers: [KbController, KbEmployeeController],
})
export class KbModule {}
