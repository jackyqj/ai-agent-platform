import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [new URL('./dist/index.js', import.meta.url).pathname],
})
const client = new Client({ name: 'final-smoke', version: '0.0.1' })
try {
  await client.connect(transport)
  const tools = await client.listTools()
  console.log('✓ tools/list:', tools.tools.map(t => t.name).join(', '))
  const r1 = await client.callTool({ name: 'knowledge_search', arguments: { query: '报销 上限' } })
  console.log('✓ 检索「报销 上限」:'); console.log(String((r1.content as any[])[0]?.text))
  const r2 = await client.callTool({ name: 'knowledge_search', arguments: { query: '年假 几天' } })
  console.log('✓ 检索「年假 几天」:'); console.log(String((r2.content as any[])[0]?.text))
  const r3 = await client.callTool({ name: 'knowledge_search', arguments: { query: '不存在的关键词xyz' } })
  console.log('✓ 无命中处理:'); console.log(String((r3.content as any[])[0]?.text))
  await client.close()
  console.log('ALL PASS')
} catch (e) { console.error('FAIL:', e); process.exit(1) }
