import { Injectable } from '@nestjs/common'
import { parseDeptOverlays, resolveDshPreset, type DshPresetName } from './permissions.js'

/** 部门级 DSH 权限覆盖（默认继承角色，部门 overlay 优先） */
@Injectable()
export class PermissionPolicyService {
  private overlays: Record<string, DshPresetName>

  constructor() {
    this.overlays = parseDeptOverlays(process.env.CP_DEPT_PERMISSION)
  }

  resolve(role: string, dept: string): DshPresetName {
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
