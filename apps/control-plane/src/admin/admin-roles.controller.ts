// 管理面：自定义角色（13 工单收尾）——角色 = 名称 + 权限点集合 + DSH preset
import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { RequirePermission } from '../common/require-permission.decorator.js'
import { AuditStore } from '../common/audit.store.js'
import { RolesService } from '../common/roles.service.js'
import type { DshPresetName, Permission } from '../common/permissions.js'

@Controller('admin/roles')
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermission('user.manage')
export class AdminRolesController {
  constructor(
    private readonly roles: RolesService,
    private readonly audit: AuditStore,
  ) {}

  @Get()
  list() {
    return { roles: this.roles.list() }
  }

  @Post()
  async upsert(
    @Req() req: { user: { sub: string } },
    @Body() body: { name?: string; permissions?: Permission[]; dshPreset?: DshPresetName },
  ) {
    try {
      await this.roles.upsert(body.name ?? '', body.permissions ?? [], body.dshPreset ?? 'workspace-write')
      await this.audit.append({ userId: req.user.sub, eventType: 'admin.role.upsert', payload: { name: body.name, permissions: body.permissions, dshPreset: body.dshPreset } })
      return { ok: true, roles: this.roles.list() }
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST)
    }
  }

  @Delete(':name')
  async remove(@Req() req: { user: { sub: string } }, @Param('name') name: string) {
    try {
      const ok = await this.roles.remove(name)
      if (!ok) throw new HttpException('不存在', HttpStatus.NOT_FOUND)
      await this.audit.append({ userId: req.user.sub, eventType: 'admin.role.remove', payload: { name } })
      return { ok: true, roles: this.roles.list() }
    } catch (e) {
      if (e instanceof HttpException) throw e
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST)
    }
  }
}
