/**
 * vector-index.ts — 向量索引（17 工单 RAG）
 * 试点规模（<1000 切片）用 JSON 索引文件 + 内存余弦检索；pgvector 到位后替换为 PG 存储（接口不变）。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface Chunk {
  id: string
  source: string          // 来源文档
  heading: string         // 所在章节标题
  text: string
  vector: number[]        // 4096 维（nv-embed-v1）
}

export interface VectorIndex {
  model: string
  chunks: Chunk[]
}

export async function loadIndex(indexPath: string): Promise<VectorIndex | undefined> {
  try {
    const raw = await readFile(indexPath, 'utf8')
    return JSON.parse(raw) as VectorIndex
  } catch {
    return undefined // 未摄取或损坏 → 回退关键词
  }
}

export async function saveIndex(indexPath: string, index: VectorIndex): Promise<void> {
  await mkdir(dirname(indexPath), { recursive: true })
  await writeFile(indexPath, JSON.stringify(index))
}

/** 余弦 top-k（query 向量 vs 全部切片向量） */
export function searchTopK(index: VectorIndex, queryVec: number[], k: number): { chunk: Chunk; score: number }[] {
  const scored = index.chunks
    .map((chunk) => ({ chunk, score: cosineSafe(queryVec, chunk.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
  return scored
}

function cosineSafe(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** 文档切块：按章节/段落切 ~500 字切片（v1；PDF/Word 解析在 17 完整版） */
export function chunkDocument(source: string, text: string): { heading: string; text: string }[] {
  const lines = text.split(/\r?\n/)
  const out: { heading: string; text: string }[] = []
  let heading = '(引言)'
  let buf: string[] = []
  const flush = () => {
    const content = buf.join('\n').trim()
    if (content.length >= 20) out.push({ heading, text: content })
    buf = []
  }
  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) {
      flush()
      heading = line.replace(/^#{1,3}\s*/, '').trim()
      continue
    }
    buf.push(line)
    if (buf.join(' ').length >= 500) flush()
  }
  flush()
  return out
}
