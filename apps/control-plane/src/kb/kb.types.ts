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

export const KB_SUPPORTED_EXT = new Set(['.md', '.txt', '.markdown', '.pdf', '.docx'])
export const KB_MAX_BYTES = 20 * 1024 * 1024

export const DEFAULT_KB_VISIBILITY: KbVisibility = {
  classification: 'internal',
  departments: ['*'],
  roles: [],
}
