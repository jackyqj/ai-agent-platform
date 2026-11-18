import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope'
import { apply, inject } from '../src/index.ts'

const tool = (name: string) => defineTool({
  name,
  description: name,
  parameters: {},
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: String(value) }],
  },
  async execute() { return 'ok' },
})

async function setup() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  ctx.tools.register(tool('mcp__kb__knowledge_search'))
  ctx.tools.register(tool('mcp__db__list_tables'))
  ctx.tools.register(tool('echo'))
  return ctx
}

async function mountPlugin(ctx: Context, config: { allowedServers?: string[] }) {
  const scope = createScope(ctx, { preset: 'mcp-visibility' })
  await scope.ctx.plugin(Object.assign(apply, { inject }), config)
  return scope
}

const namesOf = (ctx: Context, scopeKey: unknown) => ctx.tools.schemas(scopeKey as never).map((t) => t.name)

describe('mcp-visibility', () => {
  it('deny 非白名单 MCP 工具，保留白名单 MCP 与非 MCP 工具', async () => {
    const ctx = await setup()
    const scope = await mountPlugin(ctx, { allowedServers: ['kb'] })
    const names = namesOf(ctx, scopeOf(scope.ctx))
    expect(names).toContain('mcp__kb__knowledge_search')
    expect(names).toContain('echo')
    expect(names).not.toContain('mcp__db__list_tables')
  })

  it('空白名单 deny 所有 mcp__ 工具（assistant 看不到 knowledge_search）', async () => {
    const ctx = await setup()
    const scope = await mountPlugin(ctx, { allowedServers: [] })
    const names = namesOf(ctx, scopeOf(scope.ctx))
    expect(names).toContain('echo')
    expect(names).not.toContain('mcp__kb__knowledge_search')
    expect(names).not.toContain('mcp__db__list_tables')
  })

  it('全局视图不受 scoped restriction 影响', async () => {
    const ctx = await setup()
    await mountPlugin(ctx, { allowedServers: ['kb'] })
    const globalNames = ctx.tools.schemas().map((t) => t.name)
    expect(globalNames).toContain('mcp__kb__knowledge_search')
    expect(globalNames).toContain('mcp__db__list_tables')
    expect(globalNames).toContain('echo')
  })

  it('晚注册的工具（异步 MCP 发现）经 tools/change 触发 reconcile 后仍被过滤', async () => {
    const ctx = await setup()
    const scope = await mountPlugin(ctx, { allowedServers: ['kb'] })
    // 模拟 MCP 异步注册一个非白名单 server 的工具
    ctx.tools.register(tool('mcp__db__query_readonly'))
    const names = namesOf(ctx, scopeOf(scope.ctx))
    expect(names).not.toContain('mcp__db__query_readonly')
    expect(names).toContain('mcp__kb__knowledge_search')
  })

  it('scope dispose 后 restriction 一并撤销', async () => {
    const ctx = await setup()
    const scope = await mountPlugin(ctx, { allowedServers: [] })
    const before = namesOf(ctx, scopeOf(scope.ctx))
    expect(before).not.toContain('mcp__kb__knowledge_search')
    await scope.dispose()
    // 全局仍完整
    expect(ctx.tools.schemas().map((t) => t.name)).toContain('mcp__kb__knowledge_search')
  })
})
