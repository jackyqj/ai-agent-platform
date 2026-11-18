// Agent 编排领域类型（docs/agent-orchestration-design.md §4）
// AgentSpec / CapabilityCatalog 是 UI、API、编译器、修订表统一面对的模型，
// 不面对 agent.cordis.yml 文本。

export interface ModelDef {
  provider: string
  model: string
  label: string
}

export interface McpServerDef {
  /** 与 host 层 dsh-mcp-client.config.serverName 一致，如 'kb' | 'db' */
  serverName: string
  label: string
  description: string
}

export interface HostDef {
  /** 只读展示的 host-plane 项：sandbox / approval / registries / persistence */
  id: string
  label: string
}

export interface CapabilityCatalog {
  models: ModelDef[]
  mcpServers: McpServerDef[]
  hostPlane: HostDef[]
}

export interface AgentSpec {
  /** [a-z0-9][a-z0-9-]*，目录名，创建后不可改 */
  id: string
  name: string
  description: string
  visibility: { departments?: string[]; roles?: string[] }
  approvalLevel: 'none' | 'self' | 'manager'
  modelRoute: { provider: string; model: string; pinned: boolean }
  /** 编译为 dsh-persona.config.text */
  persona: string
  /** catalog.mcpServers[].serverName 的子集；空 = 不暴露任何 MCP 工具 */
  mcp: string[]
  /** 钉死的已发布 skill 版本；缺省或空 = 不挂 skill-filesystem */
  skills?: AgentSkillBinding[]
}

export interface AgentSkillBinding {
  skillId: string
  /** 简化 semver，禁止 `"latest"` */
  version: string
}

// ── 编译产物（IR）───────────────────────────────────────────────

export type PluginConfig = Record<string, unknown> | PluginRow[]

export interface PluginRow {
  id: string
  name: string
  config?: PluginConfig
  disabled?: boolean
  /** cordis:group 行 */
  group?: boolean
  /** group 行的 isolate realm 键 */
  isolate?: Record<string, boolean>
}

export interface PluginGraph {
  rows: PluginRow[]
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: Array<{ path: string; message: string }> }
