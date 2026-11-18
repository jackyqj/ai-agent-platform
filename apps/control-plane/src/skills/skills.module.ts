import { Module } from '@nestjs/common'
import { UsersModule } from '../users/users.module.js'
import { AuditStore } from '../common/audit.store.js'
import { RolesService } from '../common/roles.service.js'
import { PgStore } from '../store/pg.store.js'
import { UsersService } from '../users/users.service.js'
import { NotificationsController, SkillsController } from './skills.controller.js'
import { NotificationsService } from './notifications.service.js'
import { SkillsService } from './skills.service.js'

@Module({
  imports: [UsersModule],
  providers: [
    {
      provide: NotificationsService,
      useFactory: (pg: PgStore) => new NotificationsService(pg),
      inject: [PgStore],
    },
    {
      provide: SkillsService,
      useFactory: (pg: PgStore, audit: AuditStore, users: UsersService, roles: RolesService, inbox: NotificationsService) =>
        new SkillsService(pg, audit, users, roles, inbox),
      inject: [PgStore, AuditStore, UsersService, RolesService, NotificationsService],
    },
  ],
  controllers: [SkillsController, NotificationsController],
  exports: [SkillsService, NotificationsService],
})
export class SkillsModule {}
