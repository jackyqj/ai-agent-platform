import { Controller, Get, HttpException, HttpStatus, Param, Req, UseGuards } from '@nestjs/common'
import { ApiKeyGuard, ScopeGuard, type ServiceRequest } from '../keys/api-key.guard.js'
import { SecretsService } from './secrets.service.js'

/** Instance-facing resolve: X-API-Key + secrets:resolve. Never holds the master key in the caller. */
@Controller('internal/secrets')
@UseGuards(ApiKeyGuard, new ScopeGuard('secrets:resolve'))
export class InternalSecretsController {
  constructor(private readonly secrets: SecretsService) {}

  @Get(':ref')
  async resolve(@Req() req: ServiceRequest, @Param('ref') ref: string) {
    const hit = await this.secrets.resolve(ref, { via: 'http', actorId: req.service?.keyId })
    if (!hit) throw new HttpException('not found', HttpStatus.NOT_FOUND)
    return hit
  }
}
