// Domain types for the control-plane HTTP seam. These give names to the
// payloads the store-client returns, so views never guess a field name.

export interface Me {
  id: string;
  name: string;
  role: string;
  dept: string;
  permissionMode?: string;
}

export interface ModelRoute {
  model: string;
  pinned?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  modelRoute?: ModelRoute;
  approvalLevel?: string;
  status?: string;
}

export interface Approval {
  id: string;
  requesterUserId: string;
  action: string;
  level: string;
}

export interface QuotaPolicy {
  scopeType: string;
  scopeId?: string | null;
  period: string;
  budgetRequests: number;
  overPolicy: string;
}

export interface User {
  id: string;
  name: string;
  dept: string;
  role: string;
  permissionMode?: string;
  status: 'active' | 'disabled' | string;
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

export type Route = 'store' | 'admin';

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
  toast: string | null;
  toastErr: boolean;

  agents: Agent[];
  agentBusy: Record<string, boolean>;
  agentResults: Record<string, string>;

  pId: string;
  pName: string;
  pDesc: string;
  pBased: string;

  approvals: Approval[];
  allAgents: Agent[];
  stats: { stats: StatsBody } | null;
  quotas: QuotaPolicy[];
  users: User[];
  userEdits: Record<string, { dept: string; role: string }>;
  userFilter: string;
  sessions: SessionRow[];
  sessUser: string;
  sessDept: string;
  sessFrom: string;
  selectedSessionId: string;
  sessionDetail: SessionDetail | null;
  instances: { count: number; instances: Instance[] } | null;
  rbac: { deptOverlays: Record<string, string> } | null;
  models: ModelsBody | null;
  audit: AuditEvent[];
  auditUser: string;
  auditSession: string;
  auditType: string;

  qScope: 'all' | 'user';
  qScopeId: string;
  qBudget: string;
  ovDept: string;
  ovPreset: string;

  errors: Record<string, string>;
}
