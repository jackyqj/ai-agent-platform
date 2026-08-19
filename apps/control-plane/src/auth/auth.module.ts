import { Module } from '@nestjs/common'
import { AuthService } from './auth.service.js'
import { AuthController } from './auth.controller.js'
import { UsersModule } from '../users/users.module.js'

@Module({
  imports: [UsersModule], // JwtService 由 CommonModule 全局注册提供
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
