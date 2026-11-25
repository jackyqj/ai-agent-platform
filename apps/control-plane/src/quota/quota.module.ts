import { Module } from '@nestjs/common'
import { QuotaService } from './quota.service.js'
import { QuotaController } from './quota.controller.js'
import { MeQuotaController } from './me-quota.controller.js'

@Module({
  providers: [QuotaService],
  controllers: [QuotaController, MeQuotaController],
  exports: [QuotaService],
})
export class QuotaModule {}
