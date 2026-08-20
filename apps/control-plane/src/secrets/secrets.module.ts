import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common'
import { PgStore } from '../store/pg.store.js'
import { AuditStore } from '../common/audit.store.js'
import { CredentialVault } from './vault.js'
import { masterKeyOf, SecretsService } from './secrets.service.js'
import { SecretsController } from './secrets.controller.js'

@Injectable()
class SecretsBootstrap implements OnModuleInit {
  private readonly logger = new Logger('Secrets')
  constructor(
    private readonly secrets: SecretsService,
    private readonly audit: AuditStore,
  ) {}

  async onModuleInit() {
    const seeded = await this.secrets.bootstrap()
    if (seeded.length === 0) return
    this.logger.log(`bootstrapped ${seeded.join(', ')} from env (values not logged)`)
    await this.audit.append({ eventType: 'secrets.bootstrap', payload: { refs: seeded } })
  }
}

@Global()
@Module({
  providers: [
    {
      provide: SecretsService,
      useFactory: (pg: PgStore) => new SecretsService(new CredentialVault(pg.pool, masterKeyOf(process.env))),
      inject: [PgStore],
    },
    SecretsBootstrap,
  ],
  controllers: [SecretsController],
  exports: [SecretsService],
})
export class SecretsModule {}
