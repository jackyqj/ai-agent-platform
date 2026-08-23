/**
 * ingest.ts — 知识库摄取（17 工单 RAG）
 * 用法：EMBED_API_KEY=... npm run ingest
 * 读 docs/*（Markdown/PDF/Word）+ manifest.json → 切块 → 嵌入 → 写 data/index.json
 */
import { fileURLToPath } from 'node:url'
import { embed } from './embedding.js'
import { listAndParseDocs } from './doc-sources.js'
import { loadManifest, resolveVisibility } from './permissions.js'
import { chunkDocument, saveIndex, type Chunk, type VectorIndex } from './vector-index.js'

const DOCS_ROOT = process.env.KB_DOCS_ROOT ?? fileURLToPath(new URL('../docs', import.meta.url))
const INDEX_PATH = process.env.KB_INDEX_PATH ?? fileURLToPath(new URL('../data/index.json', import.meta.url))

const manifest = await loadManifest(DOCS_ROOT)
const sources = await listAndParseDocs(DOCS_ROOT)

const pieces: { source: string; heading: string; text: string; visibility: ReturnType<typeof resolveVisibility> }[] = []
for (const src of sources) {
  const visibility = resolveVisibility(manifest, src.path)
  for (const c of chunkDocument(src.path, src.text)) {
    pieces.push({ source: src.path, ...c, visibility })
  }
}
console.log(`[ingest] ${sources.length} 文档 → ${pieces.length} 切片，开始嵌入...`)

const BATCH = 16
const chunks: Chunk[] = []
for (let i = 0; i < pieces.length; i += BATCH) {
  const batch = pieces.slice(i, i + BATCH)
  const vectors = await embed(batch.map((p) => p.text), 'passage')
  batch.forEach((p, j) => {
    chunks.push({
      id: `${p.source}#${i + j}`,
      source: p.source,
      heading: p.heading,
      text: p.text,
      vector: vectors[j],
      visibility: p.visibility,
    })
  })
  console.log(`[ingest] ${Math.min(i + BATCH, pieces.length)}/${pieces.length}`)
}

const index: VectorIndex = { model: process.env.EMBED_MODEL ?? 'nvidia/nv-embed-v1', chunks }
await saveIndex(INDEX_PATH, index)
console.log(`[ingest] 完成：${chunks.length} 切片 → ${INDEX_PATH}`)
