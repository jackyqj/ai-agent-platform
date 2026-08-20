// 用量/审计聚合 API（15 工单）：管理看板数据源
import { Controller, Get, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { RequirePermission } from '../common/require-permission.decorator.js'
import { PgStore } from '../store/pg.store.js'

@Controller('admin/stats')
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermission('audit.view')
export class StatsController {
  constructor(private readonly pg: PgStore) {}

  @Get('usage')
  async usage() {
    return { stats: await this.pg.usageStats() }
  }
}
