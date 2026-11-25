import { Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { AgentsService } from './agents.service.js'
import { FavoritesService } from './favorites.service.js'

@Controller('me')
@UseGuards(AuthGuard)
export class FavoritesController {
  constructor(
    private readonly favorites: FavoritesService,
    private readonly agents: AgentsService,
  ) {}

  @Get('favorites')
  async list(@Req() req: { user: { sub: string } }) {
    return { ids: await this.favorites.list(req.user.sub) }
  }

  @Post('favorites/:agentId')
  async add(@Req() req: { user: { sub: string; role: string; dept: string } }, @Param('agentId') agentId: string) {
    const visible = await this.agents.listFor(req.user.role, req.user.dept)
    if (!visible.some((a) => a.id === agentId)) throw new HttpException('agent not found', HttpStatus.NOT_FOUND)
    return { ids: await this.favorites.add(req.user.sub, agentId) }
  }

  @Delete('favorites/:agentId')
  async remove(@Req() req: { user: { sub: string } }, @Param('agentId') agentId: string) {
    return { ids: await this.favorites.remove(req.user.sub, agentId) }
  }
}
