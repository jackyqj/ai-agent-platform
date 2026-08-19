/**
 * embedding.ts — NVIDIA embedding 客户端（17 工单 RAG）
 * 试点用云端 embedding（nv-embed-v1，4096 维）；私有 bge-m3（D17）到位后替换实现即可。
 */
export interface EmbedConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export function embedConfig(): EmbedConfig {
  return {
    baseUrl: process.env.EMBED_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.EMBED_API_KEY ?? '',
    model: process.env.EMBED_MODEL ?? 'nvidia/nv-embed-v1',
  }
}

/** 批量嵌入（query 或 passage 类型，nv-embed-v1 需要区分） */
export async function embed(texts: string[], inputType: 'query' | 'passage'): Promise<number[][]> {
  const cfg = embedConfig()
  if (!cfg.apiKey) throw new Error('EMBED_API_KEY not set')
  const res = await fetch(`${cfg.baseUrl}/embeddings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.model, input: texts, input_type: inputType }),
  })
  if (!res.ok) throw new Error(`embedding API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as { data: { embedding: number[] }[] }
  return json.data.map((d) => d.embedding)
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb))
}
