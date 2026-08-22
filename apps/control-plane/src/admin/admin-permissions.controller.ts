import { Body, Controller, Get, HttpException, HttpStatus, Put, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../common/auth.guard.js'
import { PermissionGuard } from '../common/permission.guard.js'
import { RequirePermission } from '../common/require-permission.decorator.js'
import { AuditStore } from '../common/audit.store.js'
import { PermissionPolicyService } from '../common/permission-policy.service.js'
import { isDshPresetName, DSH_PRESETS, PERMISSIONS, ROLE_DSH_PRESET } from '../common/permissions.js'

@Controller('admin/permissions')
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermission('user.manage')
export class AdminPermissionsController {
  constructor(
    private readonly policies: PermissionPolicyService,
    private readonly audit: AuditStore,
  ) {}

  @Get()
  get() {
    return {
      rolePresets: ROLE_DSH_PRESET,
      matrix: PERMISSIONS,
      presets: DSH_PRESETS,
      deptOverlays: this.policies.listOverlays(),
    }
  }

  @Put('overlays')
  async setOverlay(
    @Req() req: { user: { sub: string } },
    @Body() body: { dept?: string; preset?: string | null },
  ) {
    const dept = body.dept?.trim()
    if (!dept) throw new HttpException('dept required', HttpStatus.BAD_REQUEST)
    if (body.preset === null || body.preset === '') {
      this.policies.unsetOverlay(dept)
    } else {
      const preset = body.preset
      if (typeof preset !== 'string' || !isDshPresetName(preset)) {
        throw new HttpException('preset must be read-only | workspace-write | danger-full-access', HttpStatus.BAD_REQUEST)
      }
      this.policies.setOverlay(dept, preset)
    }
    await this.audit.append({
      userId: req.user.sub,
      eventType: 'admin.permission.overlay',
      payload: { dept, preset: body.preset ?? null },
    })
    return { ok: true, deptOverlays: this.policies.listOverlays() }
  }
}
