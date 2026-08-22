// 平台 MCP 工具可见性过滤（docs/agent-orchestration-design.md §5 实现 4 / 决策 6）。
//
// MCP 工具由 host 层 dsh-mcp-client 注册为 `mcp__<server>__<raw>`（进程内
// serverName 唯一，不能按 preset 各挂一份）。本行是 agent-plane 的过滤缝：
// 在 preset scope 内用 `ctx.tools.restrict({ deny })` 把不在白名单 serverName
// 下的 mcp__ 工具从该 agent 的可见集移除。
//
// restrict 是精确名、未知名报错，而 MCP 工具名是运行期动态发现——所以这里
// 监听 `tools/change`（注册/注销/restriction 变化时 emit），每次 reconcile：
// 读全局工具名、按 `mcp__<server>__` 前缀算出 deny 名单、重新 restrict。
// 旧的 restriction 先 dispose，避免 intersect 累积。

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// 类型侧合并 `ctx.tools` 到 Context（运行时只经 inject 拿 service）。
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'mcp-visibility'

export const inject = ['tools'] as const

export interface Config {
  /** 该 agent 可见的 MCP serverName 白名单；空 = 不暴露任何 mcp__ 工具。 */
  allowedServers?: string[]
}

export const Config: z<Config> = z.object({
  allowedServers: z.array(z.string()).default([]),
})

export function apply(ctx: Context, config: Config): void {
  const allowed = new Set(config.allowedServers ?? [])
  let dispose: (() => void) | undefined
  let lastKey = ''

  const reconcile = (): void => {
    // 全局视图（无 scoped restriction）：含所有已注册的 mcp__ 工具。
    const deny = ctx.tools
      .schemas()
      .map((s) => s.name)
      .filter((n) => n.startsWith('mcp__') && ![...allowed].some((s) => n.startsWith(`mcp__${s}__`)))
    // restrict() 本身会 emit tools/change（restriction 变化即 onChange），
    // 用名单指纹去重，避免「restrict → tools/change → reconcile → restrict」死循环。
    const key = deny.join('\u0000')
    if (key === lastKey) return
    lastKey = key
    dispose?.()
    dispose = undefined
    if (deny.length > 0) {
      dispose = ctx.tools.restrict({ deny })
    }
  }

  // tools/change 是「unfiltered registry-subject」事件：scoped listener 也收到每次变化。
  ctx.on('tools/change', reconcile)
  reconcile()
}
