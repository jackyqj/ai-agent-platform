// 配额管理 API（16 工单）
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
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
}
