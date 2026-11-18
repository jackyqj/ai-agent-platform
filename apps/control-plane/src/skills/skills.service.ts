import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { AuditStore } from '../common/audit.store.js'
import { RolesService } from '../common/roles.service.js'
import { PgStore } from '../store/pg.store.js'
import { UsersService } from '../users/users.service.js'
import { NotificationsService } from './notifications.service.js'
import { MemorySkillsRepo, PgSkillsRepo, type SkillsRepo } from './skills.store.js'
import {
  SEMVER_RE, SLUG_RE, SkillsError, starsOf,
  type ChangeRequest, type ChangeRequestStatus, type FeedbackKind, type SkillActor,
  type SkillRecord, type SkillStatus, type SkillVersion, type SkillVisibility,
} from './types.js'
import { wilsonLowerBound } from './wilson.js'

export interface SkillCreateInput {
  slug: string
  title: string
  description?: string
  body?: string
  frontmatter?: Record<string, unknown>
  version?: string
  visibility?: SkillVisibility
  departmentId?: string
  tags?: string[]
}

export interface SkillPatchInput {
  title?: string
  description?: string
  body?: string
  frontmatter?: Record<string, unknown>
  version?: string
  visibility?: SkillVisibility
  departmentId?: string
  tags?: string[]
}

@Injectable()
export class SkillsService {
  private readonly repo: SkillsRepo

  constructor(
    pg: PgStore,
    private readonly audit: AuditStore,
    private readonly users: UsersService,
    private readonly roles: RolesService,
    private readonly inbox: NotificationsService,
  ) {
    this.repo = pg.pool ? new PgSkillsRepo(pg.pool) : new MemorySkillsRepo()
  }

  async create(input: SkillCreateInput, actor: SkillActor): Promise<SkillRecord> {
    const slug = input.slug.trim()
    if (!SLUG_RE.test(slug)) throw new SkillsError('slug 须为 kebab-case', 400)
    if (await this.repo.getSkillBySlug(slug)) throw new SkillsError('slug 已存在', 409)
    const title = (input.title ?? '').trim()
    if (!title) throw new SkillsError('title 不能为空', 400)
    const version = input.version ?? '0.1.0'
    if (!SEMVER_RE.test(version)) throw new SkillsError('version 须为简化 semver', 400)
    const visibility = input.visibility ?? 'company'
    this.assertVisibility(visibility, input.departmentId, actor)
    const now = new Date().toISOString()
    const row: SkillRecord = {
      id: randomUUID(),
      slug,
      title,
      description: (input.description ?? '').trim(),
      ownerId: actor.id,
      visibility,
      departmentId: visibility === 'department' ? (input.departmentId ?? actor.dept) : undefined,
      tags: input.tags ?? [],
      status: 'draft',
      likeCount: 0,
      dislikeCount: 0,
      score: 0,
      draftFrontmatter: input.frontmatter ?? { name: slug, description: title },
      draftBody: input.body ?? '',
      draftVersion: version,
      createdAt: now,
      updatedAt: now,
    }
    await this.repo.insertSkill(row)
    await this.audit.append({ userId: actor.id, eventType: 'skill.create', payload: { id: row.id, slug } })
    return row
  }

  async patch(id: string, input: SkillPatchInput, actor: SkillActor): Promise<SkillRecord> {
    const skill = await this.requireSkill(id)
    this.assertAuthorOrManage(skill, actor)
    if (skill.status === 'archived' && !this.roles.can(actor.role, 'skill.manage')) {
      throw new SkillsError('已下架 skill 不可编辑', 409)
    }
    if (input.title !== undefined) {
      const title = input.title.trim()
      if (!title) throw new SkillsError('title 不能为空', 400)
      skill.title = title
    }
    if (input.description !== undefined) skill.description = input.description.trim()
    if (input.body !== undefined) skill.draftBody = input.body
    if (input.frontmatter !== undefined) skill.draftFrontmatter = input.frontmatter
    if (input.version !== undefined) {
      if (!SEMVER_RE.test(input.version)) throw new SkillsError('version 须为简化 semver', 400)
      skill.draftVersion = input.version
    }
    if (input.tags !== undefined) skill.tags = input.tags
    if (input.visibility !== undefined) {
      if (!this.roles.can(actor.role, 'skill.manage')) throw new SkillsError('无权改可见性', 403)
      this.assertVisibility(input.visibility, input.departmentId ?? skill.departmentId, actor)
      skill.visibility = input.visibility
      skill.departmentId = input.visibility === 'department' ? (input.departmentId ?? actor.dept) : undefined
    }
    skill.updatedAt = new Date().toISOString()
    await this.repo.updateSkill(skill)
    await this.audit.append({ userId: actor.id, eventType: 'skill.patch', payload: { id } })
    return skill
  }

  async submit(id: string, actor: SkillActor): Promise<SkillRecord> {
    const skill = await this.requireSkill(id)
    this.assertAuthorOrManage(skill, actor)
    if (skill.status === 'archived') throw new SkillsError('已下架 skill 不可提交', 409)
    const versions = await this.repo.listVersions(id)
    if (versions.some((v) => v.status === 'pending')) throw new SkillsError('已有待审核版本', 409)
    if (!SEMVER_RE.test(skill.draftVersion)) throw new SkillsError('version 须为简化 semver', 400)
    if (await this.repo.getVersionBySemver(id, skill.draftVersion)) {
      throw new SkillsError(`版本 ${skill.draftVersion} 已存在`, 409)
    }
    const now = new Date().toISOString()
    const ver: SkillVersion = {
      id: randomUUID(),
      skillId: id,
      version: skill.draftVersion,
      frontmatter: { name: skill.slug, description: skill.description, ...skill.draftFrontmatter },
      body: skill.draftBody,
      status: 'pending',
      createdAt: now,
    }
    await this.repo.insertVersion(ver)
    await this.syncSkillStatus(skill)
    await this.audit.append({ userId: actor.id, eventType: 'skill.submit', payload: { id, version: ver.version } })
    for (const uid of this.reviewerIds()) {
      await this.inbox.notify(uid, 'skill.submitted', { skillId: id, slug: skill.slug, version: ver.version, by: actor.id })
    }
    return skill
  }

  async addVersion(id: string, input: { version: string; body?: string; frontmatter?: Record<string, unknown> }, actor: SkillActor): Promise<SkillRecord> {
    await this.patch(id, { version: input.version, body: input.body, frontmatter: input.frontmatter }, actor)
    return this.submit(id, actor)
  }

  async review(skillId: string, versionId: string, decision: 'approve' | 'reject', actor: SkillActor, comment?: string): Promise<SkillRecord> {
    if (!this.roles.can(actor.role, 'skill.review')) throw new SkillsError('无权审核', 403)
    const skill = await this.requireSkill(skillId)
    const ver = await this.repo.getVersion(versionId)
    if (!ver || ver.skillId !== skillId) throw new SkillsError('版本不存在', 404)
    if (ver.status !== 'pending') throw new SkillsError('该版本不在审核中', 409)
    const now = new Date().toISOString()
    ver.reviewerId = actor.id
    ver.reviewComment = comment
    ver.reviewedAt = now
    switch (decision) {
      case 'approve':
        ver.status = 'published'
        ver.publishedAt = now
        skill.currentVersionId = ver.id
        skill.title = String(ver.frontmatter.title ?? skill.title)
        if (typeof ver.frontmatter.description === 'string') skill.description = ver.frontmatter.description
        await this.repo.updateVersion(ver)
        await this.markOpenRequestsResolved(skillId, ver.version)
        break
      case 'reject':
        ver.status = 'rejected'
        await this.repo.updateVersion(ver)
        break
      default: {
        const _d: never = decision
        throw new SkillsError(`未知审核决定：${String(_d)}`, 400)
      }
    }
    await this.syncSkillStatus(skill)
    await this.audit.append({
      userId: actor.id,
      eventType: decision === 'approve' ? 'skill.approve' : 'skill.reject',
      payload: { id: skillId, version: ver.version, comment },
    })
    await this.inbox.notify(skill.ownerId, 'skill.reviewed', {
      skillId, slug: skill.slug, version: ver.version, decision, comment: comment ?? '',
    })
    return skill
  }

  async archive(id: string, actor: SkillActor): Promise<SkillRecord> {
    if (!this.roles.can(actor.role, 'skill.manage')) throw new SkillsError('无权下架', 403)
    const skill = await this.requireSkill(id)
    skill.status = 'archived'
    skill.updatedAt = new Date().toISOString()
    await this.repo.updateSkill(skill)
    await this.audit.append({ userId: actor.id, eventType: 'skill.archive', payload: { id } })
    return skill
  }

  async list(actor: SkillActor): Promise<SkillRecord[]> {
    const all = await this.repo.listSkills()
    return all
      .filter((s) => this.canSee(s, actor))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        const na = a.likeCount + a.dislikeCount
        const nb = b.likeCount + b.dislikeCount
        if (nb !== na) return nb - na
        return b.updatedAt.localeCompare(a.updatedAt)
      })
  }

  async listPublished(actor: SkillActor): Promise<Array<SkillRecord & { version: string }>> {
    const rows = (await this.list(actor)).filter((s) => s.status === 'published')
    const out: Array<SkillRecord & { version: string }> = []
    for (const s of rows) {
      const ver = s.currentVersionId ? await this.repo.getVersion(s.currentVersionId) : undefined
      out.push({ ...s, version: ver?.version ?? s.draftVersion })
    }
    return out
  }

  async get(id: string, actor: SkillActor): Promise<SkillRecord> {
    const skill = await this.requireSkill(id)
    if (!this.canSee(skill, actor)) throw new SkillsError('skill 不存在', 404)
    return skill
  }

  async listVersions(id: string, actor: SkillActor): Promise<SkillVersion[]> {
    await this.get(id, actor)
    return this.repo.listVersions(id)
  }

  async getVersion(skillId: string, versionId: string, actor: SkillActor): Promise<SkillVersion> {
    await this.get(skillId, actor)
    const ver = await this.repo.getVersion(versionId)
    if (!ver || ver.skillId !== skillId) throw new SkillsError('版本不存在', 404)
    return ver
  }

  async publishedMarkdown(skillId: string, actor: SkillActor, versionId?: string): Promise<{ frontmatter: Record<string, unknown>; body: string; markdown: string; version: string }> {
    const skill = await this.get(skillId, actor)
    if (skill.status !== 'published') throw new SkillsError('skill 不存在', 404)
    let ver: SkillVersion | undefined
    if (versionId) {
      ver = SEMVER_RE.test(versionId)
        ? await this.repo.getVersionBySemver(skillId, versionId)
        : await this.repo.getVersion(versionId)
      if (!ver || ver.skillId !== skillId) throw new SkillsError('版本不存在', 404)
    } else if (skill.currentVersionId) {
      ver = await this.repo.getVersion(skill.currentVersionId)
    }
    if (!ver || ver.status !== 'published') throw new SkillsError('没有已发布版本', 404)
    const fm = {
      ...ver.frontmatter,
      name: skill.slug,
      description: skill.description,
      metadata: { ...(typeof ver.frontmatter.metadata === 'object' && ver.frontmatter.metadata ? ver.frontmatter.metadata as Record<string, unknown> : {}), skill_id: skill.id, version: ver.version },
    }
    const yaml = Object.entries(fm)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join('\n')
    return { frontmatter: fm, body: ver.body, version: ver.version, markdown: `---\n${yaml}\n---\n${ver.body}` }
  }

  /** Compile-time snapshot: published skill + exact semver, no caller visibility filter. */
  async snapshotPublished(skillId: string, version: string): Promise<{ slug: string; markdown: string; version: string }> {
    const skill = await this.repo.getSkill(skillId)
    if (!skill) throw new SkillsError('skill 不存在', 404)
    const pack = await this.publishedMarkdown(skillId, { id: skill.ownerId, role: 'admin', dept: skill.departmentId ?? '' }, version)
    return { slug: skill.slug, markdown: pack.markdown, version: pack.version }
  }

  async currentPublishedSemver(skillId: string): Promise<string | undefined> {
    const skill = await this.repo.getSkill(skillId)
    if (!skill?.currentVersionId) return undefined
    const ver = await this.repo.getVersion(skill.currentVersionId)
    return ver?.status === 'published' ? ver.version : undefined
  }

  async setFeedback(id: string, kind: FeedbackKind, actor: SkillActor): Promise<SkillRecord> {
    const skill = await this.get(id, actor)
    if (skill.status !== 'published') throw new SkillsError('只能给已发布 skill 投票', 409)
    const now = new Date().toISOString()
    const existing = await this.repo.getFeedback(id, actor.id)
    await this.repo.upsertFeedback({
      id: existing?.id ?? randomUUID(),
      skillId: id,
      versionId: skill.currentVersionId,
      userId: actor.id,
      kind,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    await this.recomputeScore(skill)
    return skill
  }

  async feedbackSummary(id: string, actor: SkillActor): Promise<{ likeCount: number; dislikeCount: number; score: number; stars: number; mine?: FeedbackKind }> {
    const skill = await this.get(id, actor)
    const mine = await this.repo.getFeedback(id, actor.id)
    return { likeCount: skill.likeCount, dislikeCount: skill.dislikeCount, score: skill.score, stars: starsOf(skill.score), mine: mine?.kind }
  }

  async addChangeRequest(skillId: string, input: { versionId?: string; lineNo: number; originalText: string; suggestedText: string; reason?: string }, actor: SkillActor): Promise<ChangeRequest> {
    const skill = await this.get(skillId, actor)
    if (skill.status === 'archived') throw new SkillsError('已下架 skill 不可提建议', 409)
    const versionId = input.versionId ?? skill.currentVersionId
    if (!versionId) throw new SkillsError('没有可锚定的已发布版本', 409)
    const ver = await this.repo.getVersion(versionId)
    if (!ver || ver.skillId !== skillId || ver.status !== 'published') throw new SkillsError('只能锚定已发布版本', 409)
    const suggested = input.suggestedText.trim()
    if (!suggested) throw new SkillsError('建议正文不能为空', 400)
    const now = new Date().toISOString()
    const cr: ChangeRequest = {
      id: randomUUID(),
      skillId,
      versionId,
      anchor: { line_no: input.lineNo, original_text: input.originalText },
      suggestedText: suggested,
      reason: (input.reason ?? '').trim(),
      requesterId: actor.id,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    }
    await this.repo.insertChangeRequest(cr)
    await this.audit.append({ userId: actor.id, eventType: 'skill.change_request.open', payload: { skillId, id: cr.id } })
    if (actor.id !== skill.ownerId) {
      await this.inbox.notify(skill.ownerId, 'change_request.opened', { skillId, slug: skill.slug, changeRequestId: cr.id, by: actor.id })
    }
    return cr
  }

  async listChangeRequests(skillId: string, actor: SkillActor): Promise<ChangeRequest[]> {
    await this.get(skillId, actor)
    return this.repo.listChangeRequests(skillId)
  }

  async handleChangeRequest(id: string, decision: ChangeRequestStatus, actor: SkillActor, reply?: string): Promise<ChangeRequest> {
    const cr = await this.repo.getChangeRequest(id)
    if (!cr) throw new SkillsError('工单不存在', 404)
    const skill = await this.requireSkill(cr.skillId)
    const canHandle = skill.ownerId === actor.id
      || this.roles.can(actor.role, 'skill.review')
      || this.roles.can(actor.role, 'skill.manage')
    if (!canHandle) throw new SkillsError('无权处理工单', 403)
    if (cr.status !== 'open') throw new SkillsError('工单已处理', 409)
    switch (decision) {
      case 'adopted':
      case 'rejected':
      case 'replied':
        cr.status = decision
        break
      case 'open':
        throw new SkillsError('不能重开为 open', 400)
      default: {
        const _d: never = decision
        throw new SkillsError(`未知工单状态：${String(_d)}`, 400)
      }
    }
    cr.handlerId = actor.id
    cr.reply = reply
    cr.resolvedAt = new Date().toISOString()
    cr.updatedAt = cr.resolvedAt
    await this.repo.updateChangeRequest(cr)
    await this.audit.append({ userId: actor.id, eventType: 'skill.change_request.handle', payload: { id, decision } })
    await this.inbox.notify(cr.requesterId, 'change_request.handled', {
      skillId: skill.id, slug: skill.slug, changeRequestId: cr.id, decision, reply: reply ?? '',
    })
    return cr
  }

  async publishedVersionInfo(skillId: string): Promise<{ current?: string; versions: string[] }> {
    const skill = await this.repo.getSkill(skillId)
    const vers = await this.repo.listVersions(skillId)
    const published = vers.filter((v) => v.status === 'published')
    const current = skill?.currentVersionId
      ? published.find((v) => v.id === skill.currentVersionId)?.version
      : undefined
    return { current, versions: published.map((v) => v.version) }
  }

  publicView(skill: SkillRecord, extra?: { mine?: FeedbackKind; includeDraft?: boolean; publishedVersion?: string; publishedVersions?: string[] }): Record<string, unknown> {
    const out: Record<string, unknown> = {
      id: skill.id,
      slug: skill.slug,
      title: skill.title,
      description: skill.description,
      ownerId: skill.ownerId,
      visibility: skill.visibility,
      departmentId: skill.departmentId,
      tags: skill.tags,
      status: skill.status,
      currentVersionId: skill.currentVersionId,
      likeCount: skill.likeCount,
      dislikeCount: skill.dislikeCount,
      score: skill.score,
      stars: starsOf(skill.score),
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
    }
    if (extra?.mine) out.myFeedback = extra.mine
    if (extra?.includeDraft) {
      out.draftBody = skill.draftBody
      out.draftFrontmatter = skill.draftFrontmatter
      out.draftVersion = skill.draftVersion
    }
    if (extra?.publishedVersion) out.publishedVersion = extra.publishedVersion
    if (extra?.publishedVersions?.length) out.publishedVersions = extra.publishedVersions
    return out
  }

  private assertVisibility(visibility: SkillVisibility, departmentId: string | undefined, actor: SkillActor): void {
    switch (visibility) {
      case 'company':
        return
      case 'department':
        if (!(departmentId ?? actor.dept)) throw new SkillsError('仅本部门可见时需要 departmentId', 400)
        return
      default: {
        const _v: never = visibility
        throw new SkillsError(`未知可见性：${String(_v)}`, 400)
      }
    }
  }

  private assertAuthorOrManage(skill: SkillRecord, actor: SkillActor): void {
    if (skill.ownerId === actor.id) return
    if (this.roles.can(actor.role, 'skill.manage')) return
    throw new SkillsError('无权编辑', 403)
  }

  private canSee(skill: SkillRecord, actor: SkillActor): boolean {
    if (this.roles.can(actor.role, 'skill.manage')) return true
    if (skill.ownerId === actor.id) return true
    if (skill.status === 'pending' && this.roles.can(actor.role, 'skill.review')) return true
    if (skill.status !== 'published') return false
    if (skill.visibility === 'company') return true
    return skill.departmentId === actor.dept
  }

  private async requireSkill(id: string): Promise<SkillRecord> {
    const skill = await this.repo.getSkill(id)
    if (!skill) throw new SkillsError('skill 不存在', 404)
    return skill
  }

  private async syncSkillStatus(skill: SkillRecord): Promise<void> {
    if (skill.status === 'archived') {
      skill.updatedAt = new Date().toISOString()
      await this.repo.updateSkill(skill)
      return
    }
    const versions = await this.repo.listVersions(skill.id)
    skill.status = this.deriveStatus(versions)
    skill.updatedAt = new Date().toISOString()
    await this.repo.updateSkill(skill)
  }

  private deriveStatus(versions: SkillVersion[]): SkillStatus {
    if (versions.some((v) => v.status === 'pending')) return 'pending'
    if (versions.some((v) => v.status === 'published')) return 'published'
    return 'draft'
  }

  private async recomputeScore(skill: SkillRecord): Promise<void> {
    const votes = await this.repo.listFeedback(skill.id)
    skill.likeCount = votes.filter((v) => v.kind === 'like').length
    skill.dislikeCount = votes.filter((v) => v.kind === 'dislike').length
    skill.score = wilsonLowerBound(skill.likeCount, skill.dislikeCount)
    skill.updatedAt = new Date().toISOString()
    await this.repo.updateSkill(skill)
  }

  private async markOpenRequestsResolved(skillId: string, version: string): Promise<void> {
    const open = await this.repo.listOpenChangeRequests(skillId)
    const now = new Date().toISOString()
    for (const cr of open) {
      cr.resolvedVersion = version
      cr.updatedAt = now
      await this.repo.updateChangeRequest(cr)
    }
  }

  private reviewerIds(): string[] {
    return this.users.list()
      .filter((u) => u.status === 'active' && this.roles.can(u.role, 'skill.review'))
      .map((u) => u.id)
  }
}
