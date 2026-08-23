import { spawn } from 'node:child_process'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { Injectable, Logger } from '@nestjs/common'
import type { AuditEvent } from '../common/audit.store.js'
import { AuditStore } from '../common/audit.store.js'
import {
  DEFAULT_KB_VISIBILITY,
  KB_MAX_BYTES,
  KB_SUPPORTED_EXT,
  type KbClassification,
  type KbDocument,
  type KbSearchHit,
  type KbStatus,
  type KbUserContext,
  type KbVisibility,
} from './kb.types.js'

type DocManifest = Record<string, KbVisibility>

function repoMcpKbRoot(): string {
  if (process.env.KB_MCP_ROOT) return process.env.KB_MCP_ROOT
  // apps/control-plane cwd → ../../services/mcp-kb
  return join(process.cwd(), '../../services/mcp-kb')
}

function safeFilename(name: string): string {
  const base = basename(name)
  if (!base || base !== name || base.includes('..')) throw new Error('invalid filename')
  const ext = extname(base).toLowerCase()
  if (!KB_SUPPORTED_EXT.has(ext)) throw new Error(`unsupported format: ${ext || '(none)'}`)
  return base
}

function normalizeVisibility(raw: Partial<KbVisibility> | undefined): KbVisibility {
  const classification = raw?.classification ?? DEFAULT_KB_VISIBILITY.classification
  if (classification !== 'public' && classification !== 'internal' && classification !== 'confidential') {
    throw new Error('invalid classification')
  }
  return {
    classification,
    departments: raw?.departments?.length ? [...raw.departments] : ['*'],
    roles: raw?.roles ? [...raw.roles] : [],
    users: raw?.users?.length ? [...raw.users] : undefined,
  }
}

@Injectable()
export class KbService {
  private readonly logger = new Logger(KbService.name)
  private readonly mcpRoot = repoMcpKbRoot()
  private readonly docsRoot = process.env.KB_DOCS_ROOT ?? join(this.mcpRoot, 'docs')
  private readonly indexPath = process.env.KB_INDEX_PATH ?? join(this.mcpRoot, 'data/index.json')
  private ingestError?: string
  private ingestStartedAt?: string
  private ingestFinishedAt?: string
  private ingestLog: string[] = []
  private lastIngestAt?: string

  constructor(private readonly audit: AuditStore) {}

  private ingestRunning = false

  private pushIngestLog(line: string): void {
    this.ingestLog.push(line)
    if (this.ingestLog.length > 40) this.ingestLog.shift()
  }

  private manifestPath(): string {
    return join(this.docsRoot, 'manifest.json')
  }

  private async readManifest(): Promise<DocManifest> {
    try {
      const raw = await readFile(this.manifestPath(), 'utf8')
      return JSON.parse(raw) as DocManifest
    } catch {
      return {}
    }
  }

  private async writeManifest(manifest: DocManifest): Promise<void> {
    await mkdir(this.docsRoot, { recursive: true })
    const tmp = this.manifestPath() + '.tmp'
    await writeFile(tmp, JSON.stringify(manifest, null, 2) + '\n')
    await rename(tmp, this.manifestPath())
  }

  private async indexStats(): Promise<{ chunkCount: number; model?: string; bySource: Map<string, number> }> {
    try {
      const raw = await readFile(this.indexPath, 'utf8')
      const index = JSON.parse(raw) as { model?: string; chunks?: { source: string }[] }
      const bySource = new Map<string, number>()
      for (const c of index.chunks ?? []) {
        bySource.set(c.source, (bySource.get(c.source) ?? 0) + 1)
      }
      return { chunkCount: index.chunks?.length ?? 0, model: index.model, bySource }
    } catch {
      return { chunkCount: 0, bySource: new Map() }
    }
  }

  async listDocuments(): Promise<KbDocument[]> {
    await mkdir(this.docsRoot, { recursive: true })
    const manifest = await this.readManifest()
    const { bySource } = await this.indexStats()
    const out: KbDocument[] = []

    for (const name of await readdir(this.docsRoot)) {
      if (name === 'manifest.json') continue
      if (!KB_SUPPORTED_EXT.has(extname(name).toLowerCase())) continue
      const full = join(this.docsRoot, name)
      const st = await stat(full)
      if (!st.isFile()) continue
      const chunkCount = bySource.get(name) ?? 0
      out.push({
        name,
        format: extname(name).slice(1).toLowerCase(),
        sizeBytes: st.size,
        updatedAt: st.mtime.toISOString(),
        visibility: manifest[name] ?? DEFAULT_KB_VISIBILITY,
        indexed: chunkCount > 0,
        chunkCount,
      })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  async getStatus(): Promise<KbStatus> {
    const docs = await this.listDocuments()
    const { chunkCount, model } = await this.indexStats()
    let lastIngestAt = this.lastIngestAt
    try {
      const st = await stat(this.indexPath)
      lastIngestAt = st.mtime.toISOString()
    } catch { /* no index yet */ }
    return {
      documentCount: docs.length,
      chunkCount,
      indexModel: model,
      lastIngestAt,
      ingestRunning: this.ingestRunning,
      ingestError: this.ingestError,
      ingestStartedAt: this.ingestStartedAt,
      ingestFinishedAt: this.ingestFinishedAt,
      ingestLog: [...this.ingestLog],
    }
  }

  async documentExists(name: string): Promise<boolean> {
    try {
      const safe = safeFilename(name)
      await stat(join(this.docsRoot, safe))
      return true
    } catch {
      return false
    }
  }

  async uploadDocument(name: string, contentBase64: string, visibility?: Partial<KbVisibility>): Promise<KbDocument> {
    const safe = safeFilename(name)
    const buf = Buffer.from(contentBase64, 'base64')
    if (buf.length === 0) throw new Error('empty file')
    if (buf.length > KB_MAX_BYTES) throw new Error(`file exceeds ${KB_MAX_BYTES} bytes`)

    await mkdir(this.docsRoot, { recursive: true })
    const full = join(this.docsRoot, safe)
    const tmp = full + '.tmp'
    await writeFile(tmp, buf)
    await rename(tmp, full)

    const manifest = await this.readManifest()
    manifest[safe] = normalizeVisibility(visibility)
    await this.writeManifest(manifest)

    const st = await stat(full)
    const { bySource } = await this.indexStats()
    return {
      name: safe,
      format: extname(safe).slice(1).toLowerCase(),
      sizeBytes: st.size,
      updatedAt: st.mtime.toISOString(),
      visibility: manifest[safe],
      indexed: (bySource.get(safe) ?? 0) > 0,
      chunkCount: bySource.get(safe) ?? 0,
    }
  }

  async patchVisibility(name: string, visibility: Partial<KbVisibility>): Promise<KbVisibility> {
    const safe = safeFilename(name)
    const full = join(this.docsRoot, safe)
    await stat(full)
    const manifest = await this.readManifest()
    manifest[safe] = normalizeVisibility({ ...manifest[safe], ...visibility })
    await this.writeManifest(manifest)
    return manifest[safe]
  }

  async deleteDocument(name: string): Promise<void> {
    const safe = safeFilename(name)
    await unlink(join(this.docsRoot, safe))
    const manifest = await this.readManifest()
    delete manifest[safe]
    await this.writeManifest(manifest)
  }

  async triggerIngest(): Promise<{ ok: boolean; startedAt: string }> {
    if (this.ingestRunning) throw new Error('ingest already running')
    this.ingestRunning = true
    this.ingestError = undefined
    this.ingestLog = []
    const startedAt = new Date().toISOString()
    this.ingestStartedAt = startedAt
    this.ingestFinishedAt = undefined
    this.pushIngestLog('[ingest] started')

    const ingestJs = join(this.mcpRoot, 'dist/ingest.js')
    const child = spawn(process.execPath, [ingestJs], {
      cwd: this.mcpRoot,
      env: {
        ...process.env,
        KB_DOCS_ROOT: this.docsRoot,
        KB_INDEX_PATH: this.indexPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    void new Promise<void>((resolve) => {
      child.stdout?.on('data', (d) => {
        for (const line of String(d).split(/\r?\n/).filter(Boolean)) this.pushIngestLog(line)
      })
      child.stderr?.on('data', (d) => {
        for (const line of String(d).split(/\r?\n/).filter(Boolean)) this.pushIngestLog('[stderr] ' + line)
      })
      child.on('close', (code) => {
        this.ingestRunning = false
        this.ingestFinishedAt = new Date().toISOString()
        if (code === 0) {
          this.lastIngestAt = this.ingestFinishedAt
          this.ingestError = undefined
          this.pushIngestLog('[ingest] completed')
          this.logger.log('ingest completed')
        } else {
          this.ingestError = this.ingestLog.slice(-3).join('\n') || `exit ${code}`
          this.pushIngestLog('[ingest] failed')
          this.logger.error(`ingest failed: ${this.ingestError}`)
        }
        resolve()
      })
    })

    return { ok: true, startedAt }
  }

  async search(query: string, user: KbUserContext | undefined, limit = 5): Promise<{ hits: KbSearchHit[]; mode: string }> {
    const cli = join(this.mcpRoot, 'dist/admin-cli.js')
    const payload = JSON.stringify({
      docsRoot: this.docsRoot,
      indexPath: this.indexPath,
      query,
      limit,
      user,
    })
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cli, 'search', payload], {
        cwd: this.mcpRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      child.stdout?.on('data', (d) => { stdout += String(d) })
      child.stderr?.on('data', (d) => { stderr += String(d) })
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr.slice(-300) || `search cli exit ${code}`))
          return
        }
        try {
          resolve(JSON.parse(stdout) as { hits: KbSearchHit[]; mode: string })
        } catch (e) {
          reject(new Error('invalid search cli output: ' + (e as Error).message))
        }
      })
    })
  }

  async listAudit(limit = 50): Promise<AuditEvent[]> {
    return this.audit.query({ eventTypePrefix: 'admin.kb.', limit })
  }
}
