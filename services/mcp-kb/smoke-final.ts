import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [new URL('./dist/index.js', import.meta.url).pathname],
})
const client = new Client({ name: 'final-smoke', version: '0.0.1' })

const hrUser = { departments: ['HR'], roles: ['employee'] }
const salesUser = { departments: ['sales'], roles: ['employee'] }
const salesAdmin = { departments: ['sales'], roles: ['sales-admin'] }

try {
  await client.connect(transport)
  const tools = await client.listTools()
  console.log('✓ tools/list:', tools.tools.map(t => t.name).join(', '))

  // public FAQ — no user context needed
  const r1 = await client.callTool({ name: 'knowledge_search', arguments: { query: '试用期多长' } })
  console.log('✓ public FAQ（无 user）:'); console.log(String((r1.content as { text?: string }[])[0]?.text))

  // internal doc — needs user context
  const r2 = await client.callTool({ name: 'knowledge_search', arguments: { query: '报销 上限', user: hrUser } })
  console.log('✓ internal 报销（HR user）:'); console.log(String((r2.content as { text?: string }[])[0]?.text))

  // department-restricted — sales only
  const r3 = await client.callTool({ name: 'knowledge_search', arguments: { query: '折扣权限', user: salesUser } })
  console.log('✓ sales playbook（sales user）:'); console.log(String((r3.content as { text?: string }[])[0]?.text))

  // cross-department denial
  const r4 = await client.callTool({ name: 'knowledge_search', arguments: { query: '折扣权限', user: hrUser } })
  console.log('✓ sales playbook（HR user，应无权限）:'); console.log(String((r4.content as { text?: string }[])[0]?.text))

  // confidential — role required
  const r5 = await client.callTool({ name: 'knowledge_search', arguments: { query: '竞品底价', user: salesAdmin } })
  console.log('✓ confidential（sales-admin）:'); console.log(String((r5.content as { text?: string }[])[0]?.text))

  const r6 = await client.callTool({ name: 'knowledge_search', arguments: { query: '竞品底价', user: salesUser } })
  console.log('✓ confidential（sales employee，应无权限）:'); console.log(String((r6.content as { text?: string }[])[0]?.text))

  const r7 = await client.callTool({ name: 'knowledge_search', arguments: { query: '不存在的关键词xyz', user: hrUser } })
  console.log('✓ 无命中处理:'); console.log(String((r7.content as { text?: string }[])[0]?.text))

  await client.close()
  console.log('ALL PASS')
} catch (e) { console.error('FAIL:', e); process.exit(1) }
