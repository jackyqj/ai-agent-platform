export type KbClassification = 'public' | 'internal' | 'confidential'

export interface KbVisibility {
  classification: KbClassification
  departments: string[]
  roles: string[]
  users?: string[]
}

export interface KbDocument {
  name: string
  format: string
  sizeBytes: number
  updatedAt: string
  visibility: KbVisibility
  indexed: boolean
  chunkCount: number
}

export interface KbStatus {
  documentCount: number
  chunkCount: number
  indexModel?: string
  lastIngestAt?: string
  ingestRunning: boolean
  ingestError?: string
  ingestStartedAt?: string
  ingestFinishedAt?: string
  ingestLog?: string[]
}

export interface KbSearchHit {
  source: string
  heading: string
  snippet: string
  score: number
  rerankScore?: number
  mode: 'vector' | 'keyword'
}

export interface KbUserContext {
  userId?: string
  departments?: string[]
  roles?: string[]
}

/** 与 mcp-kb canAccess 对齐：公开放行；内部/机密按白名单、角色、部门过滤。 */
export function documentVisible(vis: KbVisibility, user: KbUserContext | undefined): boolean {
  if (vis.classification === 'public') return true
  if (!user) return false
  if (vis.users?.length) {
    if (!user.userId || !vis.users.includes(user.userId)) return false
  }
  if (vis.classification === 'confidential' && vis.roles.length > 0) {
    const userRoles = user.roles ?? []
    if (!vis.roles.some((r) => userRoles.includes(r))) return false
  }
  const depts = vis.departments
  if (depts.length === 0 || depts.includes('*')) return true
  const userDepts = user.departments ?? []
  return depts.some((d) => userDepts.includes(d))
}

export const KB_SUPPORTED_EXT = new Set(['.md', '.txt', '.markdown', '.pdf', '.docx'])
export const KB_MAX_BYTES = 20 * 1024 * 1024

export const DEFAULT_KB_VISIBILITY: KbVisibility = {
  classification: 'internal',
  departments: ['*'],
  roles: [],
}
