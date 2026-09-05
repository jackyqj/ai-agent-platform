export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export type SkillVisibility = 'company' | 'department'
export type SkillStatus = 'draft' | 'pending' | 'published' | 'archived'
export type VersionStatus = 'pending' | 'published' | 'rejected'
export type FeedbackKind = 'like' | 'dislike'
export type ChangeRequestStatus = 'open' | 'adopted' | 'rejected' | 'replied'
export type NotificationKind =
  | 'skill.submitted'
  | 'skill.reviewed'
  | 'change_request.opened'
  | 'change_request.handled'

export interface SkillActor {
  id: string
  role: string
  dept: string
}

export interface SkillRecord {
  id: string
  slug: string
  title: string
  description: string
  ownerId: string
  visibility: SkillVisibility
  departmentId?: string
  tags: string[]
  status: SkillStatus
  currentVersionId?: string
  likeCount: number
  dislikeCount: number
  score: number
  draftFrontmatter: Record<string, unknown>
  draftBody: string
  draftVersion: string
  createdAt: string
  updatedAt: string
}

export interface SkillVersion {
  id: string
  skillId: string
  version: string
  frontmatter: Record<string, unknown>
  body: string
  status: VersionStatus
  reviewerId?: string
  reviewComment?: string
  reviewedAt?: string
  publishedAt?: string
  createdAt: string
}

export interface SkillFeedback {
  id: string
  skillId: string
  versionId?: string
  userId: string
  kind: FeedbackKind
  createdAt: string
  updatedAt: string
}

export interface ChangeRequest {
  id: string
  skillId: string
  versionId: string
  anchor: { line_no: number; original_text: string }
  suggestedText: string
  reason: string
  requesterId: string
  status: ChangeRequestStatus
  handlerId?: string
  reply?: string
  resolvedVersion?: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
}

export interface InboxItem {
  id: string
  userId: string
  kind: NotificationKind
  payload: Record<string, unknown>
  readAt?: string
  createdAt: string
}

export class SkillsError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message)
  }
}

export { starsFromWilson as starsOf } from './wilson.js'
