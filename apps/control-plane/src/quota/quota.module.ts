import { Module } from '@nestjs/common'
import { QuotaService } from './quota.service.js'
import { QuotaController } from './quota.controller.js'

@Module({
  providers: [QuotaService],
  controllers: [QuotaController],
  exports: [QuotaService],
})
export class QuotaModule {}
