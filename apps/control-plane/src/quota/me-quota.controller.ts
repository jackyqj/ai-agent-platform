import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { QuotaService } from './quota.service.js'

@Controller()
export class MeQuotaController {
  constructor(private readonly quota: QuotaService) {}

  @Get('me/quota')
  @UseGuards(AuthGuard)
  async mine(@Req() req: { user: { sub: string; dept: string } }) {
    return this.quota.peek(req.user.sub, req.user.dept)
  }
}
