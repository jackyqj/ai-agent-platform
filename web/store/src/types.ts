// Domain types for the control-plane HTTP seam. These give names to the
// payloads the store-client returns, so views never guess a field name.

export interface Me {
  id: string;
  name: string;
  role: string;
  dept: string;
  permissionMode?: string;
  permissions?: string[];
}

export interface ModelRoute {
  model: string;
  pinned?: boolean;
}

export type SchedRunStatus = 'fired' | 'awaiting' | 'failed';

export interface ScheduledTask {
  id: string;
  ownerUserId: string;
  name: string;
  agentPresetId: string;
  schedule: string;
  taskTemplate: string;
  status: 'active' | 'paused' | string;
  timezone?: string;
  lastRunAt?: string;
  lastRunStatus?: SchedRunStatus;
  nextRunAt?: string;
  createdAt: string;
}

export interface ScheduledRunLog {
  id: string;
  scheduledId: string;
  name?: string;
  ownerUserId?: string;
  taskId?: string;
  status: SchedRunStatus;
  error?: string;
  runAt: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  modelRoute?: ModelRoute;
  approvalLevel?: string;
  approvalChain?: string[];
  status?: string;
  scene?: string;
  tags?: string[];
  avatar?: string;
  knowledge?: boolean;
  favoriteCount?: number;
  skillUpdates?: Array<{ skillId: string; boundVersion: string; currentVersion: string }>;
}

export interface AgentScene {
  id: string;
  label: string;
}

export interface QuotaUsage {
  unlimited: boolean;
  used: number;
  budget: number;
  remaining: number;
  period: 'day' | 'month' | string;
  overPolicy?: 'reject' | 'warn' | string;
  scopeType?: string;
}

export interface GraphProduct {
  id: string;
  name: string;
  description: string;
  version?: number;
  status?: string;
  spec?: GraphSpec;
  visibility?: { departments?: string[]; roles?: string[] };
  updatedBy?: string;
  updatedAt?: string;
}

export interface GraphNode {
  id: string;
  kind: 'agent' | 'tool' | 'gate';
  agentPresetId?: string;
  promptTemplate?: string;
  toolId?: string;
  argsTemplate?: Record<string, string>;
  when?: string;
  /** 画布坐标；缺省由 DAG 布局推算 */
  x?: number;
  y?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphSpec {
  onError: 'stop' | 'continue';
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphRevision {
  graphId: string;
  version: number;
  name: string;
  description: string;
  spec: GraphSpec;
  publishedBy: string;
  publishedAt: string;
}

export interface GraphComposeState {
  graphId: string;
  name: string;
  description: string;
  visibility: { departments?: string[]; roles?: string[] };
  spec: GraphSpec;
  version: number;
  status: string;
  dirty: boolean;
  showAdvancedJson: boolean;
  editorMode: 'list' | 'canvas';
  selectedNodeId: string | null;
  agents: Agent[];
  tools: CatalogToolView[];
  revisions: GraphRevision[];
  trialTask: string;
  trialRun: GraphRunView | null;
  trialBusy: boolean;
  saving: boolean;
  publishing: boolean;
}

export interface GraphStepView {
  nodeId: string;
  kind: string;
  status: string;
  output?: string;
  error?: string;
}

export interface GraphRunView {
  id: string;
  graphId: string;
  status: string;
  result?: string;
  error?: string;
  steps: GraphStepView[];
}

export interface ConnectorView {
  id: string;
  name: string;
  kind: string;
  status: string;
  secretRef: string;
}

export interface CatalogToolView {
  id: string;
  connectorId: string;
  name: string;
  status: string;
  description: string;
}

export interface Approval {
  id: string;
  requesterUserId: string;
  action: string;
  level: string;
  status?: string;
  chain?: string[];
  currentLevel?: number;
}

export interface QuotaPolicy {
  scopeType: string;
  scopeId?: string | null;
  period: string;
  budgetRequests: number;
  overPolicy: string;
}

export interface QuotaAlert {
  id: string;
  policyId?: string;
  userId?: string;
  scopeType: string;
  scopeId?: string;
  period: string;
  budgetRequests: number;
  usedRequests: number;
  message: string;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  dept: string;
  role: string;
  permissionMode?: string;
  status: 'active' | 'disabled' | string;
}

export interface RoleDef {
  name: string;
  permissions: string[];
  dshPreset: string;
}

export interface SessionRow {
  id: string;
  userId: string;
  userName?: string;
  dept?: string;
  agentPresetId: string;
  status: string;
  createdAt: string;
}

export interface Instance {
  id: string;
  userId?: string;
  host: string;
  port: number;
  status: string;
  lastHeartbeat?: string;
}

export interface AuditEvent {
  ts: string;
  userId?: string;
  sessionId?: string;
  eventType: string;
  payload?: unknown;
}

export interface StatsTotals {
  tasks: number;
  failed: number;
  pendingApprovals: number;
  quotaOpenAlerts?: number;
}

export interface StatsBody {
  totals: StatsTotals;
  tasksByAgent: { agent: string; total: number; failed: number }[];
  recentErrors: { id: string; error?: string }[];
}

export interface ModelsBody {
  defaultModel: string;
  gateway: {
    deployed: boolean;
    cloudBaseUrl?: string | null;
    privateBaseUrl?: string | null;
    privateModel?: string | null;
  };
  agents: { id: string; name: string; model: string; provider: string; route: 'private' | 'cloud' }[];
}

// ── app state (what the views render) ────────────────────

export type Route = 'store' | 'admin' | 'chat' | 'skills' | 'chats' | 'approvals' | 'kb';

export type SkillStatus = 'draft' | 'pending' | 'published' | 'archived';

export interface SkillItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  ownerId?: string;
  visibility?: string;
  departmentId?: string;
  tags?: string[];
  status: SkillStatus;
  currentVersionId?: string;
  likeCount: number;
  dislikeCount: number;
  score: number;
  stars: number;
  myFeedback?: 'like' | 'dislike';
  draftBody?: string;
  draftFrontmatter?: Record<string, unknown>;
  draftVersion?: string;
  publishedVersion?: string;
  publishedVersions?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SkillVersionView {
  id: string;
  skillId: string;
  version: string;
  frontmatter: Record<string, unknown>;
  body: string;
  status: string;
  reviewerId?: string;
  reviewComment?: string;
}

export interface ChangeRequestView {
  id: string;
  skillId: string;
  versionId: string;
  anchor: { line_no: number; original_text: string };
  suggestedText: string;
  reason: string;
  requesterId: string;
  status: string;
  reply?: string;
  resolvedVersion?: string;
}

export interface InboxNote {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  readAt?: string;
  createdAt: string;
}
export type AdminPane = 'workbench' | 'config' | 'kb' | 'investigate';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  pending?: boolean;
}

export interface ChatState {
  sessionId: string | null;
  agentId: string;
  error: string | null;
  messages: ChatMessage[];
  historyLoading?: boolean;
  sending?: boolean;
  runningTaskId?: string;
  citations?: KbSearchHit[];
}

export interface TaskSubmitResult {
  taskId: string;
  status: string;
  awaitingApproval?: boolean;
}

export interface TaskView {
  id: string;
  agentPresetId?: string;
  status: string;
  payload?: { task: string } | string;
  result?: { finalResponse: string; finishReason?: string };
  error?: string;
  createdAt?: string;
  finishedAt?: string;
}

export interface SessionDetail {
  session: { id: string; userId?: string; agentPresetId?: string; status?: string };
  ev: string;
  err?: string;
}

export interface AppState {
  me: Me | null;
  route: Route;
  loading: boolean;
  loginUser: string;
  showDevLogin: boolean;
  toast: string | null;
  toastErr: boolean;

  agents: Agent[];
  quota: QuotaUsage | null;
  favorites: string[];
  storeScene: string;
  storeQuery: string;
  detailAgentId: string | null;
  employeeKbDocs: KbDocument[];
  employeeKbHits: KbSearchHit[];
  employeeKbQuery: string;
  employeeKbMode: string;
  graphs: GraphProduct[];
  graphBusy: Record<string, boolean>;
  graphTask: Record<string, string>;
  lastGraphRun: GraphRunView | null;
  agentBusy: Record<string, boolean>;
  allGraphs: GraphProduct[];
  connectors: ConnectorView[];
  catalogTools: CatalogToolView[];
  connForm: { id: string; name: string; kind: string; secretRef: string; baseUrl: string; tables: string };
  toolForm: { id: string; connectorId: string; name: string; path: string };
  graphForm: { id: string; name: string };
  mySessions: SessionRow[];
  sessionTitles: Record<string, string>;
  schedTasks: ScheduledTask[];
  myApprovals: Approval[];
  schedRuns: ScheduledRunLog[];
  allSched: ScheduledTask[];
  schedFailRuns: ScheduledRunLog[];
  schedForm: { name: string; schedule: string; template: string; tz: string };
  chat: ChatState | null;
  adminPane: AdminPane;
  showPropose: boolean;

  skills: SkillItem[];
  skillDetail: SkillItem | null;
  skillVersions: SkillVersionView[];
  skillRequests: ChangeRequestView[];
  skillForm: { slug: string; title: string; description: string; body: string; version: string; visibility: string; tags: string };
  skillCreating: boolean;
  inbox: InboxNote[];
  inboxUnread: number;
  crDraft: { lineNo: number; originalText: string; suggested: string; reason: string } | null;

  pId: string;
  pName: string;
  pDesc: string;
  pBased: string;

  approvals: Approval[];
  allAgents: Agent[];
  stats: { stats: StatsBody } | null;
  quotas: QuotaPolicy[];
  quotaAlerts: QuotaAlert[];
  users: User[];
  userEdits: Record<string, { dept: string; role: string }>;
  userFilter: string;
  roleDefs: RoleDef[];
  roleForm: { name: string; permissions: string[]; dshPreset: string };
  sessions: SessionRow[];
  sessUser: string;
  sessDept: string;
  sessFrom: string;
  selectedSessionId: string;
  sessionDetail: SessionDetail | null;
  instances: { count: number; instances: Instance[] } | null;
  rbac: { deptOverlays: Record<string, string> } | null;
  permKeys: string[];
  presetKeys: string[];
  models: ModelsBody | null;
  audit: AuditEvent[];
  auditUser: string;
  auditSession: string;
  auditType: string;

  qScope: 'all' | 'user' | 'dept';
  qScopeId: string;
  qBudget: string;
  ovDept: string;
  ovPreset: string;

  kbDocuments: KbDocument[];
  kbStatus: KbStatus | null;
  kbUploadClass: KbClassification;
  kbSearchQuery: string;
  kbSearchDept: string;
  kbSearchRole: string;
  kbSearchHits: KbSearchHit[];
  kbSearchMode: string;
  kbPendingUpload: File | null;
  kbAudit: AuditEvent[];

  errors: Record<string, string>;

  compose: ComposeState | null;
  graphCompose: GraphComposeState | null;
}

// ── Agent 编排（agent-orchestration-design.md）──────────────────

export interface ModelDef {
  provider: string;
  model: string;
  label: string;
}

export interface McpServerDef {
  serverName: string;
  label: string;
  description: string;
}

export interface HostDef {
  id: string;
  label: string;
}

export interface CapabilityCatalog {
  models: ModelDef[];
  mcpServers: McpServerDef[];
  hostPlane: HostDef[];
}

export interface AgentSpec {
  id: string;
  name: string;
  description: string;
  visibility: { departments?: string[]; roles?: string[] };
  approvalLevel: 'none' | 'self' | 'manager';
  modelRoute: { provider: string; model: string; pinned: boolean };
  persona: string;
  mcp: string[];
  skills?: Array<{ skillId: string; version: string }>;
}

export interface SpecView {
  spec: AgentSpec;
  version: number;
  dirty: boolean;
  updatedBy?: string;
  updatedAt?: string;
}

export interface Revision {
  version: number;
  spec: AgentSpec;
  publishedBy: string;
  publishedAt: string;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface PreviewResult {
  validation: { ok: boolean; errors?: ValidationIssue[] };
  yaml: string;
}

export interface ComposeState {
  agentId: string;
  spec: AgentSpec | null;
  catalog: CapabilityCatalog | null;
  version: number;
  dirty: boolean;
  updatedBy?: string;
  updatedAt?: string;
  previewYaml: string;
  issues: ValidationIssue[];
  revisions: Revision[];
  saving: boolean;
  publishing: boolean;
}

// ── 知识库管理（kb-admin-design.md）────────────────────────────

export type KbClassification = 'public' | 'internal' | 'confidential';

export interface KbVisibility {
  classification: KbClassification;
  departments: string[];
  roles: string[];
}

export interface KbDocument {
  name: string;
  format: string;
  sizeBytes: number;
  updatedAt: string;
  visibility: KbVisibility;
  indexed: boolean;
  chunkCount: number;
}

export interface KbStatus {
  documentCount: number;
  chunkCount: number;
  indexModel?: string;
  lastIngestAt?: string;
  ingestRunning: boolean;
  ingestError?: string;
  ingestStartedAt?: string;
  ingestFinishedAt?: string;
  ingestLog?: string[];
}

export interface KbSearchHit {
  source: string;
  heading: string;
  snippet: string;
  score: number;
  rerankScore?: number;
  mode: 'vector' | 'keyword';
}
