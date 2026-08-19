// 手动冒烟：TS SDK client 驱动 jsonrpc 运行时 + 知识库工具
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'

const bin = new URL('../../../../packages/examples/jsonrpc-demo/lib/bin.js', import.meta.url).pathname
const cordis = new URL('../../../../packages/platform/task-worker/worker.cordis.yml', import.meta.url).pathname

await using harness = new DeepSeekHarness({
  launch: { command: process.execPath, args: [bin, cordis] },
  provider: 'deepseek-official',
  model: 'deepseek-ai/deepseek-v4-flash-0731',
  maxTokens: 8192,
})
const result = await harness.run('用知识库查一下：跨市出差交通费上限多少？', { sessionId: 'worker-smoke-1' })
console.log('=== 结果 ===')
console.log(result.finalResponse)
console.log('=== 事件类型 ===')
console.log([...new Set(result.events.map((e) => e.type))].join(', '))
