// Agent 商店目录服务 + 编排（12 工单 + agent-orchestration-design.md）
// 目录元数据在 PG（agent_presets 表）；编排 spec（AgentSpec）经 AgentComposer 编译为
// agent.cordis.yml / preset.yml，由 PresetFileStore 写入 preset 根。
import { Inject, Injectable, Logger } from '@nestjs/common'
import { PgStore } from '../store/pg.store.js'
import { AgentComposer } from './composer.js'
import { PRESET_FILE_STORE, type PresetFileStore } from './preset-file-store.js'
import type { AgentSpec, CapabilityCatalog, ValidationResult } from './types.js'

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

export interface SpecView {
  spec: AgentSpec
  version: number
  /** 有未发布的工作副本（composition 已写但未 publish） */
  dirty: boolean
  updatedBy?: string
  updatedAt?: string
}

export class SpecValidationError extends Error {
  constructor(readonly result: ValidationResult) {
    super('spec validation failed')
  }
}

// 4 份种子 spec（agent-orchestration-design.md §4.2）：手写，不做 YAML 反编译。
// persona 对齐现网 presets/*/agent.cordis.yml；mcp 按 persona 实际依赖（kb 已挂，db 未启用）。
const SEED_SPECS: AgentSpec[] = [
  {
    id: 'assistant', name: '通用助手', description: '日常问答、文档起草、信息整理（试点 4 场景的底座）',
    visibility: {}, approvalLevel: 'none',
    modelRoute: { provider: 'deepseek-official', model: 'deepseek-ai/deepseek-v4-flash-0731', pinned: false },
    persona: '你是「公司 AI 助手」。你的用户是公司同事（含大量非技术背景同事），回答要直接、平实、可执行。\n你是"把活干完"的助手：能用工具查资料、算数据、生成文档就去做，做完汇报结果。\n涉及公司数据时严格遵守数据分级：机密数据只能在私有模型路由下处理，绝不外传。\n敏感操作（写数据库、对外发送）一律先走审批；超出能力或权限时明确说明，不编造。',
    mcp: [],
  },
  {
    id: 'hr-assistant', name: 'HR 制度助手', description: '报销/请假/差旅等制度问答，检索公司知识库并标注出处',
    visibility: {}, approvalLevel: 'none',
    modelRoute: { provider: 'deepseek-official', model: 'deepseek-ai/deepseek-v4-flash-0731', pinned: false },
    persona: '你是公司 HR 制度助手。只回答公司制度相关问题（报销、请假、差旅、考勤、福利等）。\n规则：1) 必须先用 knowledge_search 工具检索制度文档，以检索结果为唯一事实来源；2) 回答时标注出处文档；\n3) 检索不到就明说"知识库未收录"，绝不根据常识编造公司制度；4) 给出来源章节和关键数字。',
    mcp: ['kb'],
  },
  {
    id: 'doc-search', name: '研发文档检索', description: '检索研发规范/设计/FAQ，给出来源位置',
    visibility: {}, approvalLevel: 'none',
    modelRoute: { provider: 'deepseek-official', model: 'deepseek-ai/deepseek-v4-flash-0731', pinned: false },
    persona: '你是研发文档检索助手。帮工程师快速定位内部文档（规范、设计、FAQ、排障手册）。\n规则：1) 用 knowledge_search 检索并给出来源与位置；2) 检索词先宽后窄，多试几个说法；\n3) 找不到时说明知识库覆盖范围，引导用户提交文档入库。',
    mcp: ['kb'],
  },
  {
    id: 'report-builder', name: '数据报表助手', description: '数据库只读查询与汇总报表（模型路由钉死私有，查询需审批）',
    visibility: { roles: ['developer', 'admin'] }, approvalLevel: 'self',
    modelRoute: { provider: 'gateway', model: 'private/qwen-72b', pinned: true },
    persona: '你是公司数据报表助手。只负责用数据库工具查询和汇总数据。\n铁律：1) 第一步必须先实际调用 list_tables 工具查看真实表结构，禁止猜测或编造表名/字段；\n2) 然后调用 query_readonly 执行 SELECT，一次查不清就细化查询；3) 工具返回什么就汇报什么，\n禁止编造工具输出或伪造结果；4) 汇报用表格，标注统计口径（时间范围/分组维度）与行数；\n5) 查询失败或数据为空时如实说明，不得假装成功。',
    mcp: [],
  },
]

interface RevisionRow {
  version: number
  spec: AgentSpec
  yaml: string
  meta: string
  publishedBy: string
  publishedAt: string
}

@Injectable()
export class AgentsService {
  private logger = new Logger('Agents')
  private memory = new Map<string, AgentPreset>()
  // pool=null（开发/冒烟/测试）时的编排回退
  private memoryComposition = new Map<string, AgentSpec>()
  private memoryRevisions = new Map<string, RevisionRow[]>()

  constructor(
    private readonly pg: PgStore,
    private readonly composer: AgentComposer,
    @Inject(PRESET_FILE_STORE) private readonly files: PresetFileStore,
  ) {
    this.seed('assistant', '通用助手', '日常问答、文档起草、信息整理（试点底座）', {}, { provider: 'deepseek-official', model: 'deepseek-ai/deepseek-v4-flash-0731', pinned: false }, 'none')
    this.seed('hr-assistant', 'HR 制度助手', '报销/请假/差旅制度问答（知识库检索+出处）', {}, { provider: 'deepseek-official', model: 'deepseek-ai/deepseek-v4-flash-0731', pinned: false }, 'none')
    this.seed('report-builder', '数据报表助手', '数据库只读查询与汇总报表', { roles: ['developer', 'admin'] }, { provider: 'gateway', model: 'private/qwen-72b', pinned: true }, 'self')
    this.seed('doc-search', '研发文档检索', '检索研发规范/设计/FAQ', {}, { provider: 'deepseek-official', model: 'deepseek-ai/deepseek-v4-flash-0731', pinned: false }, 'none')
  }

  private seed(
    id: string, name: string, description: string, visibility: AgentPreset['visibility'],
    modelRoute: AgentPreset['modelRoute'], approvalLevel: AgentPreset['approvalLevel'],
  ) {
    this.memory.set(id, { id, name, description, visibility, modelRoute, approvalLevel, status: 'published', version: 1 })
  }

  private async persist(): Promise<boolean> {
    return this.pg.pool !== null
  }

  // ── 目录（12 工单，原有）──────────────────────────────────────

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

  // ── 编排（agent-orchestration-design.md §8）───────────────────

  capabilities(): CapabilityCatalog {
    return this.composer.catalog
  }

  /** 当前工作副本：composition（已写）→ 最新修订 → 种子 spec。 */
  private async currentSpec(id: string): Promise<AgentSpec> {
    if (await this.persist()) {
      const row = await this.pg.getAgentComposition(id)
      if (row?.composition) return row.composition as AgentSpec
      const revs = await this.pg.listAgentRevisions(id)
      if (revs[0]) return revs[0].spec as AgentSpec
    } else {
      const comp = this.memoryComposition.get(id)
      if (comp) return comp
      const revs = this.memoryRevisions.get(id)
      if (revs?.length) return revs[revs.length - 1]!.spec
    }
    const seed = SEED_SPECS.find((s) => s.id === id)
    if (!seed) throw new Error(`agent ${id} not found`)
    return seed
  }

  async getSpec(id: string): Promise<SpecView> {
    const spec = await this.currentSpec(id)
    if (await this.persist()) {
      const row = await this.pg.getAgentComposition(id)
      return {
        spec,
        version: (row?.version as number) ?? 0,
        dirty: row?.composition !== undefined && row?.composition !== null,
        updatedBy: row?.updatedBy as string | undefined,
        updatedAt: row?.updatedAt as string | undefined,
      }
    }
    return { spec, version: this.memory.get(id)?.version ?? 0, dirty: this.memoryComposition.has(id) }
  }

  validateSpec(spec: AgentSpec): ValidationResult {
    return this.composer.validate(spec)
  }

  /** 编辑器实时预览：校验 + 编译后的 YAML（§9 右栏只读预览的数据源）。 */
  previewSpec(spec: AgentSpec): { validation: ValidationResult; yaml: string } {
    const validation = this.composer.validate(spec)
    const yaml = this.composer.serialize(this.composer.compile(spec))
    return { validation, yaml }
  }

  async putSpec(id: string, spec: AgentSpec, byUserId: string, expectedUpdatedAt?: string): Promise<void> {
    if (spec.id !== id) throw new Error(`spec.id "${spec.id}" 与路径 id "${id}" 不一致`)
    const result = this.composer.validate(spec)
    if (!result.ok) throw new SpecValidationError(result)
    if (expectedUpdatedAt !== undefined && await this.persist()) {
      const row = await this.pg.getAgentComposition(id)
      const current = row?.updatedAt ? new Date(row.updatedAt as string).toISOString() : undefined
      if (current && current !== expectedUpdatedAt) {
        throw new Error('composition conflict: 已被他人修改，请刷新后重试')
      }
    }
    if (await this.persist()) {
      await this.pg.updateAgentComposition(id, spec, byUserId)
    } else {
      this.memoryComposition.set(id, spec)
    }
  }

  async publishSpec(id: string, expectedVersion: number, publishedBy: string): Promise<{ agent: AgentPreset; version: number }> {
    const spec = await this.currentSpec(id)
    const result = this.composer.validate(spec)
    if (!result.ok) throw new SpecValidationError(result)
    const graph = this.composer.compile(spec)
    const yaml = this.composer.serialize(graph)
    const meta = this.composer.compileMeta(spec)

    // 先 PG 提交（§10 步骤 4），commit 后再写文件（步骤 5）。
    const nextVersion = await this.persist()
      ? await this.pg.publishAgentPreset({
          id, spec, name: spec.name, description: spec.description,
          visibility: spec.visibility, modelRoute: spec.modelRoute, approvalLevel: spec.approvalLevel,
          compiledYaml: yaml, compiledMeta: meta, publishedBy, expectedVersion,
        })
      : this.memoryPublish(id, spec, yaml, meta, publishedBy, expectedVersion)

    // commit 之后原子写文件；写失败靠 P3 漂移告警兜底（PG 已提交但文件未落）。
    await this.files.write(id, yaml, meta)
    const agent = await this.get(id)
    if (!agent) throw new Error(`agent ${id} not found`)
    return { agent, version: nextVersion }
  }

  async listRevisions(id: string): Promise<Array<{ version: number; spec: AgentSpec; publishedBy: string; publishedAt: string }>> {
    if (await this.persist()) {
      const rows = await this.pg.listAgentRevisions(id)
      return rows.map((r) => ({ version: Number(r.version), spec: r.spec as AgentSpec, publishedBy: String(r.publishedBy), publishedAt: String(r.publishedAt) }))
    }
    const revs = this.memoryRevisions.get(id) ?? []
    return revs.slice().reverse().map((r) => ({ version: r.version, spec: r.spec, publishedBy: r.publishedBy, publishedAt: r.publishedAt }))
  }

  /** 回滚 = 把目标修订的 spec 作为工作副本，再走一遍 publish（新版本，不改历史行）。 */
  async rollback(id: string, toVersion: number, byUserId: string): Promise<{ agent: AgentPreset; version: number }> {
    const rev = await this.getRevision(id, toVersion)
    if (!rev) throw new Error(`revision ${toVersion} not found`)
    await this.putSpec(id, rev.spec, byUserId)
    const current = await this.get(id)
    return this.publishSpec(id, current?.version ?? toVersion, byUserId)
  }

  private async getRevision(id: string, version: number): Promise<RevisionRow | undefined> {
    if (await this.persist()) {
      const row = await this.pg.getAgentRevision(id, version)
      if (!row) return undefined
      return { version: Number(row.version), spec: row.spec as AgentSpec, yaml: String(row.compiledYaml), meta: String(row.compiledMeta), publishedBy: String(row.publishedBy), publishedAt: String(row.publishedAt) }
    }
    return (this.memoryRevisions.get(id) ?? []).find((r) => r.version === version)
  }

  private memoryPublish(id: string, spec: AgentSpec, yaml: string, meta: string, publishedBy: string, expectedVersion: number): number {
    const preset = this.memory.get(id)
    if (!preset) throw new Error(`agent ${id} not found`)
    if (preset.version !== expectedVersion) {
      throw new Error(`version conflict: expected ${expectedVersion}, got ${preset.version}`)
    }
    const next = expectedVersion + 1
    const revs = this.memoryRevisions.get(id) ?? []
    revs.push({ version: next, spec, yaml, meta, publishedBy, publishedAt: new Date().toISOString() })
    this.memoryRevisions.set(id, revs)
    preset.version = next
    preset.name = spec.name
    preset.description = spec.description
    preset.visibility = spec.visibility
    preset.modelRoute = spec.modelRoute
    preset.approvalLevel = spec.approvalLevel
    preset.status = 'published'
    return next
  }

  // ── 员工自建提审（12 工单；P2 改为复制已发布 spec）────────────

  async propose(input: { id: string; name: string; description: string; basedOn: string }, byUserId: string): Promise<AgentPreset> {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(input.id)) throw new Error('id 须为小写字母/数字/中划线，且不以中划线开头')
    const existing = await this.get(input.id)
    if (existing) throw new Error(`agent ${input.id} 已存在`)
    const template = await this.get(input.basedOn)
    if (!template) throw new Error(`模板 agent ${input.basedOn} 不存在`)
    // 从模板的已发布 spec 复制完整工作副本（§8：不再只复制目录元数据）
    const baseSpec = await this.currentSpec(input.basedOn)
    const draftSpec: AgentSpec = { ...baseSpec, id: input.id, name: input.name, description: input.description }
    const draft: AgentPreset = {
      id: input.id, name: input.name, description: input.description,
      visibility: draftSpec.visibility, modelRoute: draftSpec.modelRoute, approvalLevel: draftSpec.approvalLevel,
      status: 'draft', version: 1,
    }
    if (await this.persist()) {
      await this.pg.upsertAgentPreset(draft)
      await this.pg.updateAgentPresetBasedOn(input.id, input.basedOn)
      await this.pg.updateAgentComposition(input.id, draftSpec, byUserId)
    } else {
      this.memory.set(input.id, draft)
      this.memoryComposition.set(input.id, draftSpec)
    }
    this.logger.log(`proposed ${input.id} (based on ${input.basedOn} spec) by ${byUserId}`)
    return draft
  }

  async approve(id: string, byUserId: string): Promise<AgentPreset | undefined> {
    const preset = await this.get(id)
    if (!preset) return undefined
    // 对该 draft 走与 publish 相同的事务（§8：不再复制模板 YAML）
    const r = await this.publishSpec(id, preset.version, byUserId)
    this.logger.log(`approved ${id} → v${r.version}`)
    return r.agent
  }

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
