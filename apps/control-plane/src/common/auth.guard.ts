import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common'
import { ModuleRef, Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { loadConfig } from '../config/config.js'
import { ROLES_KEY } from './roles.decorator.js'
import { UsersService } from '../users/users.service.js'

export interface AuthUser {
  sub: string // 平台用户 id
  role: string
  dept: string
}

/** JWT 校验 + 角色守卫（07 工单：平台 JWT 三重防线第一道） */
@Injectable()
export class AuthGuard implements CanActivate {
  private cfg = loadConfig()

  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>()
    const auth = req.headers.authorization ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : undefined
    if (!token) throw new UnauthorizedException('missing bearer token')

    let payload: AuthUser
    try {
      payload = await this.jwt.verifyAsync<AuthUser>(token, { secret: this.cfg.jwtSecret })
    } catch {
      throw new UnauthorizedException('invalid or expired token')
    }
    req.user = payload

    if (await this.isDisabled(payload.sub)) {
      throw new UnauthorizedException('user disabled')
    }

    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()])
    if (required && required.length > 0 && !required.includes(payload.role)) {
      throw new ForbiddenException(`role ${payload.role} not in [${required.join(', ')}]`)
    }
    return true
  }

  private async isDisabled(userId: string): Promise<boolean> {
    let users: UsersService | undefined
    try {
      users = this.moduleRef.get(UsersService, { strict: false })
    } catch {
      users = undefined
    }
    const u = users?.get(userId)
    return u?.status === 'disabled'
  }
}
