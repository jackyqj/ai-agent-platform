import { Module, Global } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuditStore } from './audit.store.js'
import { AuthGuard } from './auth.guard.js'
import { PermissionGuard } from './permission.guard.js'
import { PermissionPolicyService } from './permission-policy.service.js'
import { PgStore } from '../store/pg.store.js'

@Global()
@Module({
  imports: [JwtModule.register({ global: true })],
  providers: [
    {
      provide: PgStore,
      useValue: new PgStore(process.env.DATABASE_URL),
    },
    AuditStore,
    AuthGuard,
    PermissionGuard,
    PermissionPolicyService,
  ],
  exports: [PgStore, AuditStore, AuthGuard, PermissionGuard, PermissionPolicyService],
})
export class CommonModule {}
