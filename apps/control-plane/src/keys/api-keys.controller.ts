// 服务身份 API Key 管理（07 工单）
// 服务触发路由已移至 tasks 控制器（POST /api/service/trigger，19 工单）
import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { RequirePermission } from '../common/require-permission.decorator.js'
import { ApiKeysService } from './api-keys.service.js'
import { AuditStore } from '../common/audit.store.js'

@Controller()
export class ApiKeysController {
  constructor(
    private readonly keys: ApiKeysService,
    private readonly audit: AuditStore,
  ) {}

  // ── 管理面（admin + JWT）──

  @Post('admin/api-keys')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('user.manage')
  async createKey(@Req() req: { user: { sub: string } }, @Body() body: { name: string; scopes?: string[] }) {
    if (!body.name) throw new HttpException('name required', HttpStatus.BAD_REQUEST)
    const key = await this.keys.create(body.name, body.scopes ?? [], req.user.sub)
    return { id: key.id, name: key.name, scopes: key.scopes, apiKey: key.apiKey, notice: '明文密钥仅展示一次，请立即保存' }
  }

  @Get('admin/api-keys')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('user.manage')
  async listKeys() {
    return { keys: await this.keys.list() }
  }

  @Delete('admin/api-keys/:id')
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermission('user.manage')
  async revokeKey(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    await this.keys.revoke(id, req.user.sub)
    return { ok: true }
  }
}
