// PresetFileStore（docs/agent-orchestration-design.md §6）
// 唯一碰磁盘的地方：把 serialize 产物原子写进 preset root/<id>/。
// 生产 adapter 是磁盘（原子写），测试 adapter 是内存。

import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** DI token（interface 不能作 token，用字符串常量） */
export const PRESET_FILE_STORE = 'PRESET_FILE_STORE' as const

export interface PresetFileStore {
  write(id: string, cordisYaml: string, presetYaml: string): Promise<void>
}

/** 同目录临时文件 + rename：rename 在同一文件系统内是原子的，避免半文件。 */
async function atomicWrite(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, path)
}

/** 磁盘 adapter：写 system-trust 的 presets-company 根，控制面是该根唯一写者。 */
export class DiskPresetFileStore implements PresetFileStore {
  constructor(private readonly root: string) {}

  async write(id: string, cordisYaml: string, presetYaml: string): Promise<void> {
    const dir = join(this.root, id)
    await mkdir(dir, { recursive: true })
    await atomicWrite(join(dir, 'agent.cordis.yml'), cordisYaml)
    await atomicWrite(join(dir, 'preset.yml'), presetYaml)
  }
}

/** 内存 adapter：测试用，断言产物而不碰磁盘。 */
export class MemoryPresetFileStore implements PresetFileStore {
  readonly files = new Map<string, { cordisYaml: string; presetYaml: string }>()

  async write(id: string, cordisYaml: string, presetYaml: string): Promise<void> {
    this.files.set(id, { cordisYaml, presetYaml })
  }

  get(id: string): { cordisYaml: string; presetYaml: string } | undefined {
    return this.files.get(id)
  }
}
