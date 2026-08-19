import { Module } from '@nestjs/common'
import { ApiKeysService } from './api-keys.service.js'
import { ApiKeyGuard } from './api-key.guard.js'
import { ApiKeysController } from './api-keys.controller.js'

@Module({
  providers: [ApiKeysService, ApiKeyGuard],
  controllers: [ApiKeysController],
  exports: [ApiKeysService, ApiKeyGuard],
})
export class KeysModule {}
