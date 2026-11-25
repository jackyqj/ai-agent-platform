import { Body, Controller, Get, HttpException, HttpStatus, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { KbService } from './kb.service.js'
import type { KbUserContext } from './kb.types.js'

@Controller('kb')
@UseGuards(AuthGuard)
export class KbEmployeeController {
  constructor(private readonly kb: KbService) {}

  private actor(user: { sub: string; role: string; dept: string }): KbUserContext {
    return { userId: user.sub, departments: [user.dept], roles: [user.role] }
  }

  @Get('documents')
  async documents(@Req() req: { user: { sub: string; role: string; dept: string } }) {
    return { documents: await this.kb.listVisibleDocuments(this.actor(req.user)) }
  }

  @Post('search')
  async search(
    @Req() req: { user: { sub: string; role: string; dept: string } },
    @Body() body: { query?: string; limit?: number },
  ) {
    if (!body.query?.trim()) throw new HttpException('query required', HttpStatus.BAD_REQUEST)
    try {
      return await this.kb.search(body.query.trim(), this.actor(req.user), body.limit ?? 5)
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_GATEWAY)
    }
  }
}
