export const ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/

export type ConnectorKind = 'http' | 'postgres'
export type PublishStatus = 'draft' | 'published'
export type ToolRisk = 'read' | 'write'
export type GraphNodeKind = 'agent' | 'tool' | 'gate'
export type GraphOnError = 'stop' | 'continue'
export type RunStatus = 'running' | 'done' | 'failed' | 'awaiting_approval'

export interface Visibility {
  departments?: string[]
  roles?: string[]
}

export interface HttpConnectorConfig {
  baseUrl: string
  allowedMethods: Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>
}

export interface PostgresConnectorConfig {
  allowedTables: string[]
  maxRows: number
}

export interface Connector {
  id: string
  name: string
  kind: ConnectorKind
  status: PublishStatus
  secretRef: string
  http?: HttpConnectorConfig
  postgres?: PostgresConnectorConfig
  updatedBy?: string
  updatedAt: string
}

export type HttpBinding = {
  kind: 'http'
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  pathTemplate: string
}

export type PostgresBinding = {
  kind: 'postgres'
  mode: 'list_tables' | 'query_readonly'
}

export type ToolBinding = HttpBinding | PostgresBinding

export interface CatalogTool {
  id: string
  connectorId: string
  name: string
  description: string
  risk: ToolRisk
  status: PublishStatus
  binding: ToolBinding
  updatedBy?: string
  updatedAt: string
}

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  agentPresetId?: string
  promptTemplate?: string
  toolId?: string
  argsTemplate?: Record<string, string>
  when?: string
  x?: number
  y?: number
}

export interface GraphEdge {
  from: string
  to: string
}

export interface GraphSpec {
  onError: GraphOnError
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface GraphRecord {
  id: string
  name: string
  description: string
  status: PublishStatus
  visibility: Visibility
  spec: GraphSpec
  publishedSpec?: GraphSpec | null
  version: number
  updatedBy?: string
  updatedAt: string
}

export interface GraphRevision {
  graphId: string
  version: number
  name: string
  description: string
  visibility: Visibility
  spec: GraphSpec
  publishedBy: string
  publishedAt: string
}

export interface GraphStep {
  nodeId: string
  kind: GraphNodeKind
  status: RunStatus | 'skipped'
  output?: string
  error?: string
  ok?: boolean
  taskId?: string
}

export interface GraphRun {
  id: string
  graphId: string
  userId: string
  status: RunStatus
  input: Record<string, unknown>
  steps: GraphStep[]
  result?: string
  error?: string
  createdAt: string
  finishedAt?: string
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: Array<{ path: string; message: string }> }

export class CatalogError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message)
  }
}

export interface PublishedAgentLookup {
  get(id: string): Promise<{ id: string; status: string } | undefined>
}

export interface AgentTaskRunner {
  (args: { userId: string; agentPresetId: string; task: string }): Promise<{
    output: string
    awaitingApproval?: boolean
    taskId?: string
  }>
}

export interface AgentTaskLookup {
  (id: string): Promise<{ status: string; output?: string; error?: string } | undefined>
}
