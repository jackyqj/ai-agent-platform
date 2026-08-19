// DB MCP Server 冒烟：SDK client 直连 stdio，测 list_tables + 合法/非法查询
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../dist/index.js', import.meta.url))],
})
const client = new Client({ name: 'db-smoke', version: '0.0.1' })

try {
  await client.connect(transport)
  const tools = await client.listTools()
  console.log('✓ tools:', tools.tools.map((t) => t.name).join(', '))

  const t1 = await client.callTool({ name: 'list_tables', arguments: {} })
  console.log('✓ list_tables:'); console.log(String((t1.content as any[])[0]?.text))

  const t2 = await client.callTool({ name: 'query_readonly', arguments: { sql: 'SELECT r.name, sum(o.amount) AS total FROM demo_sales.orders o JOIN demo_sales.regions r ON r.id=o.region_id GROUP BY r.name ORDER BY total DESC' } })
  console.log('✓ 合法查询:'); console.log(String((t2.content as any[])[0]?.text))

  const t3 = await client.callTool({ name: 'query_readonly', arguments: { sql: 'DELETE FROM demo_sales.orders' } })
  console.log('✓ 非法查询（DELETE 应被拒）:'); console.log(String((t3.content as any[])[0]?.text))

  const t4 = await client.callTool({ name: 'query_readonly', arguments: { sql: 'SELECT * FROM public.tasks' } })
  console.log('✓ 白名单外表（应被拒）:'); console.log(String((t4.content as any[])[0]?.text))

  const t5 = await client.callTool({ name: 'query_readonly', arguments: { sql: 'SELECT count(*) FROM demo_sales.orders' } })
  console.log('✓ 聚合查询:'); console.log(String((t5.content as any[])[0]?.text))

  await client.close()
  console.log('ALL PASS')
} catch (e) {
  console.error('FAIL:', e)
  process.exit(1)
}
