/**
 * ingest.ts — 知识库摄取（17 工单 RAG）
 * 用法：EMBED_API_KEY=... node dist/ingest.js
 * 读 docs/*.md → 切块 → 嵌入（nv-embed-v1, passage 类型）→ 写 data/index.json
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { embed } from './embedding.js'
import { chunkDocument, saveIndex, type Chunk, type VectorIndex } from './vector-index.js'

const DOCS_ROOT = process.env.KB_DOCS_ROOT ?? fileURLToPath(new URL('../docs', import.meta.url))
const INDEX_PATH = process.env.KB_INDEX_PATH ?? fileURLToPath(new URL('../data/index.json', import.meta.url))
const TEXT_EXT = new Set(['.md', '.txt', '.markdown'])

const sources: { path: string; text: string }[] = []
for (const name of await readdir(DOCS_ROOT)) {
  if (!TEXT_EXT.has(extname(name))) continue
  sources.push({ path: name, text: await readFile(join(DOCS_ROOT, name), 'utf8') })
}

const pieces: { source: string; heading: string; text: string }[] = []
for (const src of sources) {
  for (const c of chunkDocument(src.path, src.text)) {
    pieces.push({ source: src.path, ...c })
  }
}
console.log(`[ingest] ${sources.length} 文档 → ${pieces.length} 切片，开始嵌入...`)

const BATCH = 16
const chunks: Chunk[] = []
for (let i = 0; i < pieces.length; i += BATCH) {
  const batch = pieces.slice(i, i + BATCH)
  const vectors = await embed(batch.map((p) => p.text), 'passage')
  batch.forEach((p, j) => {
    chunks.push({ id: `${p.source}#${i + j}`, source: p.source, heading: p.heading, text: p.text, vector: vectors[j] })
  })
  console.log(`[ingest] ${Math.min(i + BATCH, pieces.length)}/${pieces.length}`)
}

const index: VectorIndex = { model: process.env.EMBED_MODEL ?? 'nvidia/nv-embed-v1', chunks }
await saveIndex(INDEX_PATH, index)
console.log(`[ingest] 完成：${chunks.length} 切片 → ${INDEX_PATH}`)
