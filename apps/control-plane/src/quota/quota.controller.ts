// 配额管理 API（16 工单）
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { RequirePermission } from '../common/require-permission.decorator.js'
import { QuotaService } from './quota.service.js'

@Controller('admin/quota')
@UseGuards(AuthGuard, PermissionGuard)
export class QuotaController {
  constructor(private readonly quota: QuotaService) {}

  @Get('policies')
  @RequirePermission('quota.view')
  async policies() {
    return { policies: await this.quota.listPolicies() }
  }

  @Post('policies')
  @RequirePermission('quota.manage')
  async upsert(@Body() body: { id?: string; scopeType: string; scopeId?: string; period?: string; budgetRequests: number; overPolicy?: string }) {
    await this.quota.upsert(body)
    return { ok: true, policies: await this.quota.listPolicies() }
  }

  // --- 告警闭环：warn 超限落库的可处置告警 ---

  @Get('alerts')
  @RequirePermission('quota.view')
  async alerts(@Query('openOnly') openOnly?: string) {
    return { alerts: await this.quota.listAlerts({ openOnly: openOnly !== 'false', limit: 100 }) }
  }

  @Post('alerts/:id/resolve')
  @RequirePermission('quota.manage')
  async resolve(@Param('id') id: string, @Body() body?: { byUserId?: string }) {
    const r = await this.quota.resolveAlert(id, body?.byUserId ?? 'admin')
    return { ok: r.ok, alerts: await this.quota.listAlerts({ openOnly: true, limit: 100 }) }
  }
}
