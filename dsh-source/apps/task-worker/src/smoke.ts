// 手动冒烟：TS SDK client 驱动 sdk profile + worker patch + 知识库工具
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'

const cordis = new URL('../worker.cordis.yml', import.meta.url).pathname

await using harness = new DeepSeekHarness({
  profile: 'sdk',
  patches: [cordis],
  provider: 'gateway',
  model: process.env.DSH_MODEL ?? 'cloud/deepseek',
  maxTokens: 8192,
})
const result = await harness.run('用知识库查一下：跨市出差交通费上限多少？', { sessionId: 'worker-smoke-1' })
console.log('=== 结果 ===')
console.log(result.finalResponse)
console.log('=== 事件类型 ===')
console.log([...new Set(result.events.map((e) => e.type))].join(', '))
