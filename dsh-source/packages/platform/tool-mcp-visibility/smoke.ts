// 手动冒烟：验证 mcp-visibility 插件的过滤逻辑（绕过 vitest 的 test-invariants 门禁）
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope'
import { apply, inject } from './src/index.ts'

const tool = (name: string) => defineTool({
  name,
  description: name,
  parameters: {},
  output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
  async execute() { return 'ok' },
})

const ctx = new Context()
await ctx.plugin(SystemPrompt)
await ctx.plugin(ToolRuntime)
ctx.tools.register(tool('mcp__kb__knowledge_search'))
ctx.tools.register(tool('mcp__db__list_tables'))
ctx.tools.register(tool('echo'))

const scope = createScope(ctx, 'preset-scope')
await scope.ctx.plugin(Object.assign(apply, { inject }), { allowedServers: ['kb'] })

const scopedNames = ctx.tools.schemas(scopeOf(scope.ctx)).map((t) => t.name)
const globalNames = ctx.tools.schemas().map((t) => t.name)

console.log('scoped names :', scopedNames.join(', '))
console.log('global names :', globalNames.join(', '))

// 断言
const pass = scopedNames.includes('mcp__kb__knowledge_search')
  && scopedNames.includes('echo')
  && !scopedNames.includes('mcp__db__list_tables')
  && globalNames.includes('mcp__db__list_tables')

// 测试晚注册（异步 MCP 发现）
ctx.tools.register(tool('mcp__db__query_readonly'))
const after = ctx.tools.schemas(scopeOf(scope.ctx)).map((t) => t.name)
console.log('after late reg:', after.join(', '))
const passLate = !after.includes('mcp__db__query_readonly')

// 测试空白名单
const scope2 = createScope(ctx, 'preset-scope-2')
await scope2.ctx.plugin(Object.assign(apply, { inject }), { allowedServers: [] })
const emptyNames = ctx.tools.schemas(scopeOf(scope2.ctx)).map((t) => t.name)
console.log('empty allow  :', emptyNames.join(', '))
const passEmpty = emptyNames.includes('echo') && !emptyNames.includes('mcp__kb__knowledge_search')

console.log('')
console.log('basic      :', pass ? 'PASS' : 'FAIL')
console.log('late-reg   :', passLate ? 'PASS' : 'FAIL')
console.log('empty-allow:', passEmpty ? 'PASS' : 'FAIL')

if (!(pass && passLate && passEmpty)) process.exitCode = 1
