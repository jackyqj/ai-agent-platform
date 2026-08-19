import { Module, Global } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuditStore } from './audit.store.js'
import { AuthGuard } from './auth.guard.js'
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
  ],
  exports: [PgStore, AuditStore, AuthGuard],
})
export class CommonModule {}
