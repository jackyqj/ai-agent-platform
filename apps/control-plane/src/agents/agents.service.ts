// Agent 商店目录服务（12 工单）：PG 持久化（agent_presets 表）+ 可见性过滤 + 上架/下架
// 目录元数据在控制面（本服务）；preset 内容文件在 DSH preset 根（$DSH_HOME/presets-company）
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PgStore } from '../store/pg.store.js'

export interface AgentPreset {
  id: string
  name: string
  description: string
  visibility: { departments?: string[]; roles?: string[] }
  modelRoute: { provider: string; model: string; pinned: boolean }
  approvalLevel: 'none' | 'self' | 'manager'
  status: 'draft' | 'published' | 'deprecated'
  version: number
}

@Injectable()
export class AgentsService implements OnModuleInit {
  private logger = new Logger('Agents')
  private memory = new Map<string, AgentPreset>()

  constructor(private readonly pg: PgStore) {
    // 种子：首批 4 个 preset（对应 D19 场景与 phase2/agent-store/presets/ 目录）
    this.seed('assistant', '通用助手', '日常问答、文档起草、信息整理（试点底座）', {}, { provider: 'deepseek-official', model: 'deepseek-ai/deepseek-v4-flash-0731', pinned: false }, 'none')
    this.seed('hr-assistant', 'HR 制度助手', '报销/请假/差旅制度问答（知识库检索+出处）', {}, { provider: 'deepseek-official', model: 'deepseek-ai/deepseek-v4-flash-0731', pinned: false }, 'none')
    this.seed('report-builder', '数据报表助手', '数据库只读查询与汇总报表', { roles: ['developer', 'admin'] }, { provider: 'gateway', model: 'private/qwen-72b', pinned: true }, 'self')
    this.seed('doc-search', '研发文档检索', '检索研发规范/设计/FAQ', {}, { provider: 'deepseek-official', model: 'deepseek-ai/deepseek-v4-flash-0731', pinned: false }, 'none')
  }

  async onModuleInit() {
    await this.syncSeedsToPg()
  }

  private seed(
    id: string, name: string, description: string, visibility: AgentPreset['visibility'],
    modelRoute: AgentPreset['modelRoute'], approvalLevel: AgentPreset['approvalLevel'],
  ) {
    const p: AgentPreset = { id, name, description, visibility, modelRoute, approvalLevel, status: 'published', version: 1 }
    this.memory.set(id, p)
  }

  private async persist(): Promise<boolean> {
    return this.pg.pool !== null
  }

  async syncSeedsToPg(): Promise<void> {
    if (!(await this.persist())) return
    for (const p of this.memory.values()) {
      await this.pg.upsertAgentPreset(p).catch((e) => this.logger.error(`upsert ${p.id} failed: ${(e as Error).message}`))
    }
  }

  async listFor(role: string, dept: string): Promise<AgentPreset[]> {
    const all = await this.list()
    return all.filter((p) => {
      if (p.status !== 'published') return false
      const r = p.visibility.roles
      if (r && r.length && !r.includes(role)) return false
      const d = p.visibility.departments
      if (d && d.length && !d.includes(dept)) return false
      return true
    })
  }

  async list(): Promise<AgentPreset[]> {
    if (await this.persist()) {
      try {
        return (await this.pg.listAgentPresets()).map((r) => this.normalize(r))
      } catch (e) {
        this.logger.error(`PG listAgentPresets failed: ${(e as Error).message}`)
      }
    }
    return [...this.memory.values()]
  }

  async get(id: string): Promise<AgentPreset | undefined> {
    if (await this.persist()) {
      try {
        const row = await this.pg.getAgentPreset(id)
        if (row) return this.normalize(row)
      } catch (e) {
        this.logger.error(`PG getAgentPreset failed: ${(e as Error).message}`)
      }
    }
    return this.memory.get(id)
  }

  async publish(id: string): Promise<AgentPreset | undefined> {
    await this.pg.updateAgentPresetStatus(id, 'published')
    return this.get(id)
  }

  async unpublish(id: string): Promise<AgentPreset | undefined> {
    await this.pg.updateAgentPresetStatus(id, 'deprecated')
    return this.get(id)
  }

  async setVisibility(id: string, visibility: AgentPreset['visibility']): Promise<AgentPreset | undefined> {
    await this.pg.updateAgentPresetVisibility(id, visibility)
    return this.get(id)
  }

  // ── 员工自建提审（12 工单：复制即作者写入口，与 DSH agentPresets.copy 语义一致）──

  private presetRoot(): string {
    return process.env.CP_PRESET_ROOT ?? '/Users/jac/sw_dir/dsh/.dsh-home/presets-company'
  }

  /** 提审：创建 draft 行（id 校验 + 不冲突 + 基于模板），内容文件待 admin 批准后生成 */
  async propose(input: { id: string; name: string; description: string; basedOn: string }, byUserId: string): Promise<AgentPreset> {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(input.id)) throw new Error('id 须为小写字母/数字/中划线，且不以中划线开头')
    const existing = await this.get(input.id)
    if (existing) throw new Error(`agent ${input.id} 已存在`)
    const template = await this.get(input.basedOn)
    if (!template) throw new Error(`模板 agent ${input.basedOn} 不存在`)
    const draft: AgentPreset = {
      id: input.id, name: input.name, description: input.description,
      visibility: {}, modelRoute: template.modelRoute, approvalLevel: template.approvalLevel,
      status: 'draft', version: 1,
    }
    if (await this.persist()) {
      await this.pg.upsertAgentPreset(draft)
      await this.pg.updateAgentPresetBasedOn(input.id, input.basedOn)
    } else {
      this.memory.set(input.id, draft)
    }
    this.logger.log(`proposed ${input.id} (based on ${input.basedOn}) by ${byUserId}`)
    return draft
  }

  /** admin 批准：生成 preset 文件（复制模板目录 + 写入新元数据）→ 标 published */
  async approve(id: string): Promise<AgentPreset | undefined> {
    const row = await this.pg.getAgentPreset(id)
    if (!row) return undefined
    const basedOn = String(row.based_on ?? 'assistant')
    const root = this.presetRoot()
    const { readFile, writeFile, mkdir, copyFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const templateComposition = await readFile(join(root, basedOn, 'agent.cordis.yml'), 'utf8').catch(() => {
      throw new Error(`模板目录 ${basedOn} 缺少 agent.cordis.yml`)
    })
    const dir = join(root, id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'agent.cordis.yml'), templateComposition)
    await writeFile(
      join(dir, 'preset.yml'),
      `name: ${String(row.name)}\ndescription: ${String(row.description ?? '')}\n`,
    )
    await this.pg.updateAgentPresetStatus(id, 'published')
    this.logger.log(`approved ${id}: preset files generated at ${dir}`)
    return this.get(id)
  }

  /** admin 拒绝：保持 draft（或可删，v1 保留供修改） */
  async reject(id: string): Promise<AgentPreset | undefined> {
    const p = await this.get(id)
    if (!p) return undefined
    await this.pg.updateAgentPresetStatus(id, 'draft')
    return this.get(id)
  }

  private normalize(r: Record<string, unknown>): AgentPreset {
    return {
      id: String(r.id),
      name: String(r.name),
      description: String(r.description ?? ''),
      visibility: (r.visibility as AgentPreset['visibility']) ?? {},
      modelRoute: (r.modelRoute as AgentPreset['modelRoute']) ?? {},
      approvalLevel: (r.approvalLevel as AgentPreset['approvalLevel']) ?? 'none',
      status: (r.status as AgentPreset['status']) ?? 'draft',
      version: Number(r.version),
    }
  }
}
