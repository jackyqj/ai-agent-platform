// MCP Server 端到端自测：用官方 SDK Client 走完整协议（initialize → tools/list → tools/call）
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8787/mcp'))
const client = new Client({ name: 'smoke-test', version: '0.0.1' })

try {
  await client.connect(transport)
  console.log('✓ initialize OK')

  const tools = await client.listTools()
  console.log('✓ tools/list OK:', tools.tools.map((t) => t.name).join(', '))

  const res = await client.callTool({ name: 'knowledge_search', arguments: { query: '报销 上限' } })
  console.log('✓ tools/call OK:')
  console.log(String((res.content as any[])[0]?.text ?? '(empty)'))

  const res2 = await client.callTool({ name: 'knowledge_search', arguments: { query: '年假 几天' } })
  console.log('✓ tools/call #2 OK:')
  console.log(String((res2.content as any[])[0]?.text ?? '(empty)'))

  await client.close()
  console.log('ALL PASS')
} catch (err) {
  console.error('FAIL:', err)
  process.exit(1)
}
