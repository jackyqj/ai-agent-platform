// 能力目录（docs/agent-orchestration-design.md §4.1）
// 平台级硬编码清单：可编排的模型路由与 MCP server、只读展示的 host-plane 项。
// P0 不从网关 / MCP 农场动态发现，直到清单真的会变再抽。

import type { CapabilityCatalog, HostDef, McpServerDef, ModelDef } from './types.js'

export const MODELS: ModelDef[] = [
  { provider: 'deepseek-official', model: 'deepseek-v4-flash', label: 'DeepSeek 官方 flash（云端通用）' },
  { provider: 'gateway', model: 'private/qwen-72b', label: '私有 Qwen 72B（机密数据钉死）' },
]

// 与 host 层 cordis.patch.yml 的 dsh-mcp-client.config.serverName 对齐。
// db 尚未启用（cordis.patch.yml 中仍为注释），启用后在此追加。
export const MCP_SERVERS: McpServerDef[] = [
  { serverName: 'kb', label: '公司知识库', description: '制度/文档语义检索（knowledge_search）' },
]

// 只读展示：这些是 host-plane，不进 AgentSpec，也不编译进 preset。
export const HOST_PLANE: HostDef[] = [
  { id: 'sandbox', label: '沙箱策略' },
  { id: 'approval', label: '审批栈' },
  { id: 'registries', label: '注册表（tools/sessions/subagents）' },
  { id: 'persistence', label: '会话持久化' },
]

export const DEFAULT_CATALOG: CapabilityCatalog = {
  models: MODELS,
  mcpServers: MCP_SERVERS,
  hostPlane: HOST_PLANE,
}

export function findModel(catalog: CapabilityCatalog, provider: string, model: string): ModelDef | undefined {
  return catalog.models.find((m) => m.provider === provider && m.model === model)
}

export function findMcpServer(catalog: CapabilityCatalog, serverName: string): McpServerDef | undefined {
  return catalog.mcpServers.find((m) => m.serverName === serverName)
}
