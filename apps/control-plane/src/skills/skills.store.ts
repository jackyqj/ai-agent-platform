import type pg from 'pg'
import type {
  ChangeRequest, InboxItem, NotificationKind, SkillFeedback, SkillRecord, SkillVersion, VersionStatus,
} from './types.js'

export interface SkillsRepo {
  insertSkill(s: SkillRecord): Promise<void>
  updateSkill(s: SkillRecord): Promise<void>
  getSkill(id: string): Promise<SkillRecord | undefined>
  getSkillBySlug(slug: string): Promise<SkillRecord | undefined>
  listSkills(): Promise<SkillRecord[]>

  insertVersion(v: SkillVersion): Promise<void>
  updateVersion(v: SkillVersion): Promise<void>
  getVersion(id: string): Promise<SkillVersion | undefined>
  listVersions(skillId: string): Promise<SkillVersion[]>
  getVersionBySemver(skillId: string, version: string): Promise<SkillVersion | undefined>

  upsertFeedback(f: SkillFeedback): Promise<void>
  getFeedback(skillId: string, userId: string): Promise<SkillFeedback | undefined>
  listFeedback(skillId: string): Promise<SkillFeedback[]>

  insertChangeRequest(c: ChangeRequest): Promise<void>
  updateChangeRequest(c: ChangeRequest): Promise<void>
  getChangeRequest(id: string): Promise<ChangeRequest | undefined>
  listChangeRequests(skillId: string): Promise<ChangeRequest[]>
  listOpenChangeRequests(skillId: string): Promise<ChangeRequest[]>
}

function nowIso(): string {
  return new Date().toISOString()
}

export class MemorySkillsRepo implements SkillsRepo {
  readonly skills = new Map<string, SkillRecord>()
  readonly versions = new Map<string, SkillVersion>()
  readonly feedback = new Map<string, SkillFeedback>()
  readonly changeRequests = new Map<string, ChangeRequest>()

  async insertSkill(s: SkillRecord): Promise<void> {
    this.skills.set(s.id, { ...s })
  }
  async updateSkill(s: SkillRecord): Promise<void> {
    this.skills.set(s.id, { ...s, updatedAt: s.updatedAt || nowIso() })
  }
  async getSkill(id: string): Promise<SkillRecord | undefined> {
    return this.skills.get(id)
  }
  async getSkillBySlug(slug: string): Promise<SkillRecord | undefined> {
    return [...this.skills.values()].find((s) => s.slug === slug)
  }
  async listSkills(): Promise<SkillRecord[]> {
    return [...this.skills.values()]
  }

  async insertVersion(v: SkillVersion): Promise<void> {
    this.versions.set(v.id, { ...v })
  }
  async updateVersion(v: SkillVersion): Promise<void> {
    this.versions.set(v.id, { ...v })
  }
  async getVersion(id: string): Promise<SkillVersion | undefined> {
    return this.versions.get(id)
  }
  async listVersions(skillId: string): Promise<SkillVersion[]> {
    return [...this.versions.values()]
      .filter((v) => v.skillId === skillId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  async getVersionBySemver(skillId: string, version: string): Promise<SkillVersion | undefined> {
    return [...this.versions.values()].find((v) => v.skillId === skillId && v.version === version)
  }

  async upsertFeedback(f: SkillFeedback): Promise<void> {
    this.feedback.set(`${f.skillId}:${f.userId}`, { ...f })
  }
  async getFeedback(skillId: string, userId: string): Promise<SkillFeedback | undefined> {
    return this.feedback.get(`${skillId}:${userId}`)
  }
  async listFeedback(skillId: string): Promise<SkillFeedback[]> {
    return [...this.feedback.values()].filter((f) => f.skillId === skillId)
  }

  async insertChangeRequest(c: ChangeRequest): Promise<void> {
    this.changeRequests.set(c.id, { ...c })
  }
  async updateChangeRequest(c: ChangeRequest): Promise<void> {
    this.changeRequests.set(c.id, { ...c })
  }
  async getChangeRequest(id: string): Promise<ChangeRequest | undefined> {
    return this.changeRequests.get(id)
  }
  async listChangeRequests(skillId: string): Promise<ChangeRequest[]> {
    return [...this.changeRequests.values()]
      .filter((c) => c.skillId === skillId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  async listOpenChangeRequests(skillId: string): Promise<ChangeRequest[]> {
    return (await this.listChangeRequests(skillId)).filter((c) => c.status === 'open')
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  if (typeof v === 'string') {
    try { return JSON.parse(v) as Record<string, unknown> } catch { return {} }
  }
  return {}
}

function skillFromRow(r: Record<string, unknown>): SkillRecord {
  const tags = r.tags
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    description: String(r.description ?? ''),
    ownerId: String(r.ownerId ?? r.owner_id),
    visibility: (r.visibility === 'department' ? 'department' : 'company'),
    departmentId: r.departmentId == null && r.department_id == null ? undefined : String(r.departmentId ?? r.department_id),
    tags: Array.isArray(tags) ? tags.map(String) : [],
    status: r.status as SkillRecord['status'],
    currentVersionId: r.currentVersionId == null && r.current_version_id == null ? undefined : String(r.currentVersionId ?? r.current_version_id),
    likeCount: Number(r.likeCount ?? r.like_count ?? 0),
    dislikeCount: Number(r.dislikeCount ?? r.dislike_count ?? 0),
    score: Number(r.score ?? 0),
    draftFrontmatter: asRecord(r.draftFrontmatter ?? r.draft_frontmatter),
    draftBody: String(r.draftBody ?? r.draft_body ?? ''),
    draftVersion: String(r.draftVersion ?? r.draft_version ?? '0.1.0'),
    createdAt: String(r.createdAt ?? r.created_at),
    updatedAt: String(r.updatedAt ?? r.updated_at),
  }
}

function versionFromRow(r: Record<string, unknown>): SkillVersion {
  return {
    id: String(r.id),
    skillId: String(r.skillId ?? r.skill_id),
    version: String(r.version),
    frontmatter: asRecord(r.frontmatter),
    body: String(r.body ?? ''),
    status: r.status as VersionStatus,
    reviewerId: r.reviewerId == null && r.reviewer_id == null ? undefined : String(r.reviewerId ?? r.reviewer_id),
    reviewComment: r.reviewComment == null && r.review_comment == null ? undefined : String(r.reviewComment ?? r.review_comment),
    reviewedAt: r.reviewedAt == null && r.reviewed_at == null ? undefined : String(r.reviewedAt ?? r.reviewed_at),
    publishedAt: r.publishedAt == null && r.published_at == null ? undefined : String(r.publishedAt ?? r.published_at),
    createdAt: String(r.createdAt ?? r.created_at),
  }
}

function feedbackFromRow(r: Record<string, unknown>): SkillFeedback {
  return {
    id: String(r.id),
    skillId: String(r.skillId ?? r.skill_id),
    versionId: r.versionId == null && r.version_id == null ? undefined : String(r.versionId ?? r.version_id),
    userId: String(r.userId ?? r.user_id),
    kind: r.kind as SkillFeedback['kind'],
    createdAt: String(r.createdAt ?? r.created_at),
    updatedAt: String(r.updatedAt ?? r.updated_at),
  }
}

function crFromRow(r: Record<string, unknown>): ChangeRequest {
  const anchor = asRecord(r.anchor)
  return {
    id: String(r.id),
    skillId: String(r.skillId ?? r.skill_id),
    versionId: String(r.versionId ?? r.version_id),
    anchor: { line_no: Number(anchor.line_no ?? 0), original_text: String(anchor.original_text ?? '') },
    suggestedText: String(r.suggestedText ?? r.suggested_text ?? ''),
    reason: String(r.reason ?? ''),
    requesterId: String(r.requesterId ?? r.requester_id),
    status: r.status as ChangeRequest['status'],
    handlerId: r.handlerId == null && r.handler_id == null ? undefined : String(r.handlerId ?? r.handler_id),
    reply: r.reply == null ? undefined : String(r.reply),
    resolvedVersion: r.resolvedVersion == null && r.resolved_version == null ? undefined : String(r.resolvedVersion ?? r.resolved_version),
    resolvedAt: r.resolvedAt == null && r.resolved_at == null ? undefined : String(r.resolvedAt ?? r.resolved_at),
    createdAt: String(r.createdAt ?? r.created_at),
    updatedAt: String(r.updatedAt ?? r.updated_at),
  }
}

const SKILL_COLS = `id, slug, title, description, owner_id AS "ownerId", visibility, department_id AS "departmentId",
  tags, status, current_version_id AS "currentVersionId", like_count AS "likeCount", dislike_count AS "dislikeCount",
  score, draft_frontmatter AS "draftFrontmatter", draft_body AS "draftBody", draft_version AS "draftVersion",
  created_at AS "createdAt", updated_at AS "updatedAt"`

const VER_COLS = `id, skill_id AS "skillId", version, frontmatter, body, status,
  reviewer_id AS "reviewerId", review_comment AS "reviewComment", reviewed_at AS "reviewedAt",
  published_at AS "publishedAt", created_at AS "createdAt"`

export class PgSkillsRepo implements SkillsRepo {
  constructor(private readonly pool: pg.Pool) {}

  async insertSkill(s: SkillRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO skills (id, slug, title, description, owner_id, visibility, department_id, tags, status,
         current_version_id, like_count, dislike_count, score, draft_frontmatter, draft_body, draft_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [s.id, s.slug, s.title, s.description, s.ownerId, s.visibility, s.departmentId ?? null, s.tags, s.status,
        s.currentVersionId ?? null, s.likeCount, s.dislikeCount, s.score,
        JSON.stringify(s.draftFrontmatter), s.draftBody, s.draftVersion],
    )
  }

  async updateSkill(s: SkillRecord): Promise<void> {
    await this.pool.query(
      `UPDATE skills SET slug=$2, title=$3, description=$4, visibility=$5, department_id=$6, tags=$7, status=$8,
         current_version_id=$9, like_count=$10, dislike_count=$11, score=$12,
         draft_frontmatter=$13, draft_body=$14, draft_version=$15, updated_at=now()
       WHERE id=$1`,
      [s.id, s.slug, s.title, s.description, s.visibility, s.departmentId ?? null, s.tags, s.status,
        s.currentVersionId ?? null, s.likeCount, s.dislikeCount, s.score,
        JSON.stringify(s.draftFrontmatter), s.draftBody, s.draftVersion],
    )
  }

  async getSkill(id: string): Promise<SkillRecord | undefined> {
    const res = await this.pool.query(`SELECT ${SKILL_COLS} FROM skills WHERE id=$1`, [id])
    return res.rows[0] ? skillFromRow(res.rows[0]) : undefined
  }

  async getSkillBySlug(slug: string): Promise<SkillRecord | undefined> {
    const res = await this.pool.query(`SELECT ${SKILL_COLS} FROM skills WHERE slug=$1`, [slug])
    return res.rows[0] ? skillFromRow(res.rows[0]) : undefined
  }

  async listSkills(): Promise<SkillRecord[]> {
    const res = await this.pool.query(`SELECT ${SKILL_COLS} FROM skills`)
    return res.rows.map(skillFromRow)
  }

  async insertVersion(v: SkillVersion): Promise<void> {
    await this.pool.query(
      `INSERT INTO skill_versions (id, skill_id, version, frontmatter, body, status, reviewer_id, review_comment, reviewed_at, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [v.id, v.skillId, v.version, JSON.stringify(v.frontmatter), v.body, v.status,
        v.reviewerId ?? null, v.reviewComment ?? null, v.reviewedAt ?? null, v.publishedAt ?? null],
    )
  }

  async updateVersion(v: SkillVersion): Promise<void> {
    await this.pool.query(
      `UPDATE skill_versions SET frontmatter=$3, body=$4, status=$5, reviewer_id=$6, review_comment=$7,
         reviewed_at=$8, published_at=$9 WHERE id=$1 AND skill_id=$2`,
      [v.id, v.skillId, JSON.stringify(v.frontmatter), v.body, v.status,
        v.reviewerId ?? null, v.reviewComment ?? null, v.reviewedAt ?? null, v.publishedAt ?? null],
    )
  }

  async getVersion(id: string): Promise<SkillVersion | undefined> {
    const res = await this.pool.query(`SELECT ${VER_COLS} FROM skill_versions WHERE id=$1`, [id])
    return res.rows[0] ? versionFromRow(res.rows[0]) : undefined
  }

  async listVersions(skillId: string): Promise<SkillVersion[]> {
    const res = await this.pool.query(
      `SELECT ${VER_COLS} FROM skill_versions WHERE skill_id=$1 ORDER BY created_at DESC`,
      [skillId],
    )
    return res.rows.map(versionFromRow)
  }

  async getVersionBySemver(skillId: string, version: string): Promise<SkillVersion | undefined> {
    const res = await this.pool.query(
      `SELECT ${VER_COLS} FROM skill_versions WHERE skill_id=$1 AND version=$2`,
      [skillId, version],
    )
    return res.rows[0] ? versionFromRow(res.rows[0]) : undefined
  }

  async upsertFeedback(f: SkillFeedback): Promise<void> {
    await this.pool.query(
      `INSERT INTO skill_feedback (id, skill_id, version_id, user_id, kind, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,now())
       ON CONFLICT (skill_id, user_id) DO UPDATE SET kind=excluded.kind, version_id=excluded.version_id, updated_at=now()`,
      [f.id, f.skillId, f.versionId ?? null, f.userId, f.kind, f.createdAt],
    )
  }

  async getFeedback(skillId: string, userId: string): Promise<SkillFeedback | undefined> {
    const res = await this.pool.query(
      `SELECT id, skill_id AS "skillId", version_id AS "versionId", user_id AS "userId", kind,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM skill_feedback WHERE skill_id=$1 AND user_id=$2`,
      [skillId, userId],
    )
    return res.rows[0] ? feedbackFromRow(res.rows[0]) : undefined
  }

  async listFeedback(skillId: string): Promise<SkillFeedback[]> {
    const res = await this.pool.query(
      `SELECT id, skill_id AS "skillId", version_id AS "versionId", user_id AS "userId", kind,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM skill_feedback WHERE skill_id=$1`,
      [skillId],
    )
    return res.rows.map(feedbackFromRow)
  }

  async insertChangeRequest(c: ChangeRequest): Promise<void> {
    await this.pool.query(
      `INSERT INTO change_requests (id, skill_id, version_id, anchor, suggested_text, reason, requester_id, status,
         handler_id, reply, resolved_version, resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [c.id, c.skillId, c.versionId, JSON.stringify(c.anchor), c.suggestedText, c.reason, c.requesterId, c.status,
        c.handlerId ?? null, c.reply ?? null, c.resolvedVersion ?? null, c.resolvedAt ?? null],
    )
  }

  async updateChangeRequest(c: ChangeRequest): Promise<void> {
    await this.pool.query(
      `UPDATE change_requests SET status=$2, handler_id=$3, reply=$4, resolved_version=$5, resolved_at=$6, updated_at=now()
       WHERE id=$1`,
      [c.id, c.status, c.handlerId ?? null, c.reply ?? null, c.resolvedVersion ?? null, c.resolvedAt ?? null],
    )
  }

  async getChangeRequest(id: string): Promise<ChangeRequest | undefined> {
    const res = await this.pool.query(
      `SELECT id, skill_id AS "skillId", version_id AS "versionId", anchor, suggested_text AS "suggestedText",
              reason, requester_id AS "requesterId", status, handler_id AS "handlerId", reply,
              resolved_version AS "resolvedVersion", resolved_at AS "resolvedAt",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM change_requests WHERE id=$1`,
      [id],
    )
    return res.rows[0] ? crFromRow(res.rows[0]) : undefined
  }

  async listChangeRequests(skillId: string): Promise<ChangeRequest[]> {
    const res = await this.pool.query(
      `SELECT id, skill_id AS "skillId", version_id AS "versionId", anchor, suggested_text AS "suggestedText",
              reason, requester_id AS "requesterId", status, handler_id AS "handlerId", reply,
              resolved_version AS "resolvedVersion", resolved_at AS "resolvedAt",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM change_requests WHERE skill_id=$1 ORDER BY created_at DESC`,
      [skillId],
    )
    return res.rows.map(crFromRow)
  }

  async listOpenChangeRequests(skillId: string): Promise<ChangeRequest[]> {
    const res = await this.pool.query(
      `SELECT id, skill_id AS "skillId", version_id AS "versionId", anchor, suggested_text AS "suggestedText",
              reason, requester_id AS "requesterId", status, handler_id AS "handlerId", reply,
              resolved_version AS "resolvedVersion", resolved_at AS "resolvedAt",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM change_requests WHERE skill_id=$1 AND status='open' ORDER BY created_at DESC`,
      [skillId],
    )
    return res.rows.map(crFromRow)
  }
}

export interface NotificationsRepo {
  insert(n: InboxItem): Promise<void>
  listFor(userId: string): Promise<InboxItem[]>
  markRead(userId: string, ids?: string[]): Promise<void>
}

export class MemoryNotificationsRepo implements NotificationsRepo {
  readonly items = new Map<string, InboxItem>()

  async insert(n: InboxItem): Promise<void> {
    this.items.set(n.id, { ...n })
  }
  async listFor(userId: string): Promise<InboxItem[]> {
    return [...this.items.values()]
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  async markRead(userId: string, ids?: string[]): Promise<void> {
    const at = new Date().toISOString()
    for (const n of this.items.values()) {
      if (n.userId !== userId) continue
      if (ids && ids.length && !ids.includes(n.id)) continue
      if (!n.readAt) n.readAt = at
    }
  }
}

export class PgNotificationsRepo implements NotificationsRepo {
  constructor(private readonly pool: pg.Pool) {}

  async insert(n: InboxItem): Promise<void> {
    await this.pool.query(
      `INSERT INTO notifications (id, user_id, kind, payload) VALUES ($1,$2,$3,$4)`,
      [n.id, n.userId, n.kind, JSON.stringify(n.payload)],
    )
  }

  async listFor(userId: string): Promise<InboxItem[]> {
    const res = await this.pool.query(
      `SELECT id, user_id AS "userId", kind, payload, read_at AS "readAt", created_at AS "createdAt"
       FROM notifications WHERE user_id=$1 ORDER BY created_at DESC`,
      [userId],
    )
    return res.rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      userId: String(r.userId),
      kind: r.kind as NotificationKind,
      payload: asRecord(r.payload),
      readAt: r.readAt == null ? undefined : String(r.readAt),
      createdAt: String(r.createdAt),
    }))
  }

  async markRead(userId: string, ids?: string[]): Promise<void> {
    if (ids && ids.length) {
      await this.pool.query(
        `UPDATE notifications SET read_at=COALESCE(read_at, now()) WHERE user_id=$1 AND id = ANY($2::uuid[])`,
        [userId, ids],
      )
      return
    }
    await this.pool.query(
      `UPDATE notifications SET read_at=COALESCE(read_at, now()) WHERE user_id=$1 AND read_at IS NULL`,
      [userId],
    )
  }
}
