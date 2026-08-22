import { Injectable } from '@nestjs/common'
import { parseDeptOverlays, resolveDshPreset, type DshPresetName } from './permissions.js'
import { RolesService } from './roles.service.js'

/** 部门级 DSH 权限覆盖（默认继承角色，部门 overlay 优先；自定义角色取自身 dsh_preset） */
@Injectable()
export class PermissionPolicyService {
  private overlays: Record<string, DshPresetName>

  constructor(private readonly roles: RolesService) {
    this.overlays = parseDeptOverlays(process.env.CP_DEPT_PERMISSION)
  }

  resolve(role: string, dept: string): DshPresetName {
    // 部门覆盖恒最高（文档语义「部门覆盖优先于角色」）；然后自定义角色 preset；内置角色走默认矩阵。
    const overlay = this.overlays[dept]
    if (overlay) return overlay
    if (this.roles.has(role)) return this.roles.dshPresetOf(role)
    return resolveDshPreset(role, dept, this.overlays)
  }

  listOverlays(): Record<string, DshPresetName> {
    return { ...this.overlays }
  }

  setOverlay(dept: string, preset: DshPresetName): void {
    this.overlays[dept] = preset
  }

  unsetOverlay(dept: string): void {
    delete this.overlays[dept]
  }
}
