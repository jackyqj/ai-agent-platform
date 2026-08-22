import { Controller, Get, Query, UseGuards, HttpException, HttpStatus, Req, Redirect } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { AuthService } from './auth.service.js'
import { UsersService } from '../users/users.service.js'
import { PermissionPolicyService } from '../common/permission-policy.service.js'
import { loadConfig } from '../config/config.js'

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly policies: PermissionPolicyService,
  ) {}

  /** dev 模式登录（仅本地；生产必须 CP_AUTH_MODE=oidc） */
  @Get('auth/dev/login')
  devLogin(@Query('userId') userId: string) {
    try {
      return this.auth.devLogin(userId ?? 'u-admin')
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST)
    }
  }

  /** oidc 模式：跳转钉钉授权 */
  @Get('auth/sso/login')
  @Redirect()
  async ssoLogin() {
    try {
      return { url: await this.auth.buildAuthUrl(), statusCode: 302 }
    } catch (e) {
      throw new HttpException(`oidc not configured: ${(e as Error).message}`, HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  /** oidc 模式：回调换票（state 防 CSRF），浏览器跳回商店并带上 token */
  @Get('auth/sso/callback')
  @Redirect()
  async ssoCallback(@Query('code') code?: string, @Query('state') state?: string) {
    if (!code) throw new HttpException('missing code', HttpStatus.BAD_REQUEST)
    try {
      const result = await this.auth.oidcCallback(code, state)
      const origin = loadConfig().frontendOrigin.replace(/\/$/, '')
      return { url: `${origin}/#token=${encodeURIComponent(result.accessToken)}`, statusCode: 302 }
    } catch (e) {
      throw new HttpException(`oidc callback failed: ${(e as Error).message}`, HttpStatus.UNAUTHORIZED)
    }
  }

  /** 当前登录用户 */
  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: { user: { sub: string } }) {
    const u = this.users.get(req.user.sub)
    if (!u) throw new HttpException('user not found', HttpStatus.NOT_FOUND)
    return { id: u.id, name: u.name, dept: u.dept, role: u.role, permissionMode: this.policies.resolve(u.role, u.dept) }
  }
}
