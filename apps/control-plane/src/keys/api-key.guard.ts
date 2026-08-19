// 服务身份守卫（07 工单）：X-API-Key 头 → 校验 → 附加 service 主体
// 用法：@UseGuards(ApiKeyGuard, new ScopeGuard('task:create'))
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ApiKeysService } from './api-keys.service.js'

export interface ServicePrincipal {
  keyId: string
  name: string
  scopes: string[]
}

export interface ServiceRequest {
  service?: ServicePrincipal
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly keys: ApiKeysService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<ServiceRequest & { headers: Record<string, string | undefined> }>()
    const key = req.headers['x-api-key']
    if (!key) throw new UnauthorizedException('missing X-API-Key')
    req.service = await this.keys.validate(key)
    return true
  }
}

/** scope 校验：ApiKeyGuard 之后执行（依赖 req.service 已附加） */
export class ScopeGuard implements CanActivate {
  constructor(private readonly scope: string) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<ServiceRequest>()
    const service = req.service
    if (!service) throw new ForbiddenException('service identity required (ApiKeyGuard first)')
    if (!service.scopes.includes(this.scope)) {
      throw new ForbiddenException(`scope ${this.scope} not granted to key ${service.keyId}`)
    }
    return true
  }
}
