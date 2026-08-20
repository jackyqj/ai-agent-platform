import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common'
import { PgStore } from '../store/pg.store.js'
import { AuditStore } from '../common/audit.store.js'
import { loadConfig } from '../config/config.js'
import { KeysModule } from '../keys/keys.module.js'
import { ApiKeysService } from '../keys/api-keys.service.js'
import { CredentialVault } from './vault.js'
import { masterKeyOf, SecretsService } from './secrets.service.js'
import { SecretsController } from './secrets.controller.js'
import { InternalSecretsController } from './internal-secrets.controller.js'

const DEV_INSTANCE_TOKEN = 'cp_dev_secrets_resolve'

@Injectable()
class SecretsBootstrap implements OnModuleInit {
  private readonly logger = new Logger('Secrets')
  constructor(
    private readonly secrets: SecretsService,
    private readonly audit: AuditStore,
    private readonly keys: ApiKeysService,
  ) {}

  async onModuleInit() {
    const seeded = await this.secrets.bootstrap()
    if (seeded.length > 0) {
      this.logger.log(`bootstrapped ${seeded.join(', ')} from env (values not logged)`)
      await this.audit.append({ eventType: 'secrets.bootstrap', payload: { refs: seeded } })
    }
    await this.ensureInstanceResolveToken()
  }

  /** Interactive containers call GET /internal/secrets/:ref with this token; they never see the master key. */
  private async ensureInstanceResolveToken(): Promise<void> {
    const authMode = loadConfig().authMode
    const token =
      process.env.CP_SECRETS_TOKEN || (authMode === 'dev' ? DEV_INSTANCE_TOKEN : '')
    if (!token) {
      this.logger.warn('CP_SECRETS_TOKEN unset: interactive instances cannot HTTP-resolve secrets')
      return
    }
    process.env.CP_SECRETS_TOKEN = token
    const { created } = await this.keys.ensureWithPlaintext(
      'dsh-instance-resolve',
      ['secrets:resolve'],
      token,
      'bootstrap',
    )
    if (created) this.logger.log('registered instance resolve token (value not logged)')
  }
}

@Global()
@Module({
  imports: [KeysModule],
  providers: [
    {
      provide: SecretsService,
      useFactory: (pg: PgStore, audit: AuditStore) =>
        new SecretsService(new CredentialVault(pg.pool, masterKeyOf(process.env)), process.env, audit),
      inject: [PgStore, AuditStore],
    },
    SecretsBootstrap,
  ],
  controllers: [SecretsController, InternalSecretsController],
  exports: [SecretsService],
})
export class SecretsModule {}
