// store-client.ts — typed client over the control-plane HTTP seam (deep module).
//
// Small interface: domain-named methods (`listAgents`, `createSession`,
// `admin.users`, `admin.auditEvents`, …). The implementation absorbs the raw
// HTTP facts: base URL, auth header, token persistence, JSON (de)serialization,
// query-string cleanup, and error-message extraction. Views never touch a path,
// payload shape, or field name.

import type { Agent, AgentScene, AgentSpec, Approval, AuditEvent, CapabilityCatalog, CatalogToolView, ChangeRequestView, ConnectorView, GraphProduct, GraphRevision, GraphRunView, GraphSpec, ImAgentBinding, ImStatus, InboxNote, Instance, KbDocument, KbSearchHit, KbStatus, KbVisibility, Me, ModelsBody, PreviewResult, QuotaAlert, QuotaPolicy, QuotaUsage, Revision, RoleDef, ScheduledRunLog, ScheduledTask, SessionRow, SkillItem, SkillVersionView, SpecView, StatsBody, TaskSubmitResult, TaskView, User } from './types';

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
}

// Minimal token persistence surface — narrow enough for a test fake, satisfied
// by window.localStorage in the browser.
interface TokenStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Client {
  readonly token: string;
  setToken(t: string): void;
  clearToken(): void;

  devLogin(userId: string): Promise<{ accessToken: string }>;
  me(): Promise<Me>;

  listAgents(): Promise<{ agents: Agent[] }>;
  listAgentScenes(): Promise<{ scenes: AgentScene[] }>;
  myQuota(): Promise<QuotaUsage>;
  listFavorites(): Promise<{ ids: string[] }>;
  addFavorite(agentId: string): Promise<{ ids: string[] }>;
  removeFavorite(agentId: string): Promise<{ ids: string[] }>;
  cancelTask(id: string): Promise<{ task: TaskView; notice: string }>;
  listKbDocuments(): Promise<{ documents: KbDocument[] }>;
  searchKb(query: string, limit?: number): Promise<{ hits: KbSearchHit[]; mode: string }>;
  listGraphs(): Promise<{ graphs: GraphProduct[] }>;
  runGraph(id: string, task: string): Promise<{ run: GraphRunView }>;
  getGraphRun(id: string): Promise<{ run: GraphRunView }>;
  listSessions(): Promise<{ sessions: SessionRow[] }>;
  createSession(agentPresetId: string): Promise<{ sessionId: string; routingSecret: string }>;
  getSession(id: string): Promise<{ id: string; status: string; agentPresetId: string }>;
  closeSession(id: string): Promise<{ ok: boolean }>;
  listTasks(): Promise<{ tasks: TaskView[] }>;
  submitTask(agentPresetId: string, task: string, sessionId?: string): Promise<TaskSubmitResult>;
  getTask(id: string): Promise<{ task: TaskView }>;
  answerTaskInquiry(id: string, body: { cancelled?: boolean; answers?: { id: string; selected: string[]; custom?: string }[] }): Promise<{ task: TaskView }>;
  proposeAgent(body: { id: string; name: string; description: string; basedOn: string }): Promise<{ agent: Agent; notice: string }>;

  // ── 定时 Agent（20）用户侧 ──
  listScheduled(): Promise<{ tasks: ScheduledTask[] }>;
  createScheduled(body: { name: string; schedule: string; taskTemplate: string; agentPresetId?: string; timezone?: string }): Promise<{ task: ScheduledTask; notice: string }>;
  runScheduled(id: string): Promise<{ ok: boolean; detail?: string }>;
  setScheduledStatus(id: string, action: 'pause' | 'resume'): Promise<{ task: ScheduledTask; notice: string }>;
  removeScheduled(id: string): Promise<{ ok: boolean }>;
  scheduleRuns(id: string): Promise<{ runs: ScheduledRunLog[] }>;

  // ── 审批（14）用户侧 ──
  myApprovals(): Promise<{ approvals: Approval[] }>;
  cancelApproval(id: string): Promise<{ ok: boolean; notice?: string }>;

  // ── Agent 编排（agent-orchestration-design.md §8）──
  capabilities(): Promise<CapabilityCatalog>;
  getSpec(id: string): Promise<SpecView>;
  putSpec(id: string, spec: AgentSpec, expectedUpdatedAt?: string): Promise<{ notice: string }>;
  previewSpec(id: string, spec: AgentSpec): Promise<PreviewResult>;
  publishSpec(id: string, expectedVersion: number): Promise<{ agent: Agent; version: number; notice: string }>;
  listRevisions(id: string): Promise<{ revisions: Revision[] }>;
  rollback(id: string, toVersion: number): Promise<{ agent: Agent; version: number; notice: string }>;

  listSkills(): Promise<{ skills: SkillItem[] }>;
  createSkill(body: { slug: string; title: string; description?: string; body?: string; version?: string; visibility?: string; departmentId?: string; tags?: string[] }): Promise<{ skill: SkillItem; notice: string }>;
  getSkill(id: string): Promise<{ skill: SkillItem }>;
  patchSkill(id: string, body: Record<string, unknown>): Promise<{ skill: SkillItem; notice: string }>;
  submitSkill(id: string): Promise<{ skill: SkillItem; notice: string }>;
  archiveSkill(id: string): Promise<{ skill: SkillItem; notice: string }>;
  listSkillVersions(id: string): Promise<{ versions: SkillVersionView[] }>;
  addSkillVersion(id: string, body: { version: string; body?: string }): Promise<{ skill: SkillItem; notice: string }>;
  reviewSkill(id: string, vid: string, body: { decision: 'approve' | 'reject'; comment?: string }): Promise<{ skill: SkillItem; notice: string }>;
  skillFeedback(id: string, kind: 'like' | 'dislike'): Promise<{ skill: SkillItem }>;
  listChangeRequests(id: string): Promise<{ changeRequests: ChangeRequestView[] }>;
  addChangeRequest(id: string, body: { lineNo: number; originalText: string; suggestedText: string; reason?: string }): Promise<{ changeRequest: ChangeRequestView; notice: string }>;
  handleChangeRequest(id: string, body: { status: string; reply?: string }): Promise<{ changeRequest: ChangeRequestView }>;
  listNotifications(): Promise<{ notifications: InboxNote[]; unread: number }>;
  readNotifications(ids?: string[]): Promise<{ notifications: InboxNote[]; unread: number }>;

  admin: {
    pendingApprovals(): Promise<{ approvals: Approval[] }>;
    decideApproval(id: string, approve: boolean): Promise<unknown>;
    statsUsage(): Promise<{ stats: StatsBody }>;
    quotaPolicies(): Promise<{ policies: QuotaPolicy[] }>;
    setQuotaPolicy(policy: { scopeType: string; scopeId?: string; period: string; budgetRequests: number }): Promise<unknown>;
    quotaAlerts(): Promise<{ alerts: QuotaAlert[] }>;
    resolveQuotaAlert(id: string): Promise<{ ok: boolean; alerts: QuotaAlert[] }>;
    allAgents(): Promise<{ agents: Agent[] }>;
    createAgent(body: { id: string; name: string; description: string; basedOn: string }): Promise<{ agent: Agent; notice: string }>;
    removeAgent(id: string): Promise<{ notice: string }>;
    publishAgent(id: string, publish: boolean): Promise<unknown>;
    enableIm(id: string, body: { keywords?: string[]; priority?: number }): Promise<{ binding: ImAgentBinding; notice: string }>;
    disableIm(id: string): Promise<{ binding: ImAgentBinding; notice: string }>;
    getIm(id: string): Promise<{ binding: ImAgentBinding | null }>;
    imBindings(): Promise<{ bindings: ImAgentBinding[] }>;
    imStatus(): Promise<ImStatus>;
    users(): Promise<{ users: User[] }>;
    patchUser(id: string, patch: { dept?: string; role?: string; status?: string }): Promise<unknown>;
    sessions(query: Record<string, string | undefined>): Promise<{ sessions: SessionRow[] }>;
    session(id: string): Promise<{ session: SessionRow; events: AuditEvent[] }>;
    instances(): Promise<{ count: number; instances: Instance[] }>;
    stopInstance(id: string): Promise<unknown>;
    reapIdle(): Promise<{ reaped: string[] }>;
    permissions(): Promise<{ deptOverlays: Record<string, string>; matrix: Record<string, string[]>; rolePresets: Record<string, string>; presets: string[] }>;
    setOverlay(dept: string, preset: string | null): Promise<unknown>;
    models(): Promise<ModelsBody>;
    auditEvents(query: Record<string, string>): Promise<{ events: AuditEvent[] }>;
    allScheduled(): Promise<{ tasks: ScheduledTask[] }>;
    scheduledRuns(query: Record<string, string>): Promise<{ runs: ScheduledRunLog[] }>;
    roles(): Promise<{ roles: RoleDef[] }>;
    upsertRole(body: { name: string; permissions: string[]; dshPreset: string }): Promise<{ ok: boolean; roles: RoleDef[] }>;
    removeRole(name: string): Promise<{ ok: boolean; roles: RoleDef[] }>;
    setApprovalChain(id: string, roles: string[]): Promise<{ roles: string[] }>;
    kbDocuments(): Promise<{ documents: KbDocument[] }>;
    kbStatus(): Promise<KbStatus>;
    uploadKbDocument(name: string, contentBase64: string, visibility: Partial<KbVisibility>): Promise<{ ok: boolean; document: KbDocument }>;
    patchKbVisibility(name: string, visibility: Partial<KbVisibility>): Promise<{ ok: boolean; visibility: KbVisibility }>;
    deleteKbDocument(name: string): Promise<{ ok: boolean }>;
    triggerKbIngest(): Promise<{ ok: boolean; startedAt: string }>;
    kbSearch(body: { query: string; limit?: number; user?: { departments?: string[]; roles?: string[] } }): Promise<{ hits: KbSearchHit[]; mode: string }>;
    kbAudit(limit?: number): Promise<{ events: AuditEvent[] }>;
    connectors(): Promise<{ connectors: ConnectorView[] }>;
    putConnector(id: string, body: unknown): Promise<{ connector: ConnectorView }>;
    publishConnector(id: string): Promise<{ notice: string }>;
    tools(): Promise<{ tools: CatalogToolView[] }>;
    putTool(id: string, body: unknown): Promise<{ tool: CatalogToolView }>;
    publishTool(id: string): Promise<{ notice: string }>;
    graphs(): Promise<{ graphs: GraphProduct[] }>;
    getGraph(id: string): Promise<{ graph: GraphProduct }>;
    putGraph(id: string, body: { name: string; description?: string; visibility?: unknown; spec: GraphSpec }): Promise<{ graph: GraphProduct; notice: string }>;
    publishGraph(id: string): Promise<{ graph: GraphProduct; notice: string }>;
    unpublishGraph(id: string): Promise<{ notice: string }>;
    graphRevisions(id: string): Promise<{ revisions: GraphRevision[] }>;
    rollbackGraph(id: string, toVersion: number): Promise<{ graph: GraphProduct; notice: string }>;
    trialGraph(id: string, task: string): Promise<{ run: GraphRunView }>;
    latestGraphRun(id: string): Promise<{ run: GraphRunView | null }>;
  };
}

export function createClient({ baseUrl, storage }: { baseUrl: string; storage?: TokenStore }): Client {
  const store = storage || defaultStorage();
  let token = store.getItem('cp_token') || '';

  function setToken(t: string) {
    token = t;
    store.setItem('cp_token', t);
  }
  function clearToken() {
    token = '';
    store.removeItem('cp_token');
  }

  async function request<T>(path: string, { method = 'GET', body, query }: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;

    let url = baseUrl + path;
    if (query) {
      const qs = Object.entries(query).filter(([, v]) => v != null && v !== '');
      if (qs.length) url += '?' + new URLSearchParams(qs.map(([k, v]) => [k, String(v)]));
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!res.ok) {
      let message = String(res.status);
      try {
        const j = (await res.json()) as { message?: string };
        if (j && j.message) message = j.message;
      } catch { /* keep status code */ }
      throw new Error(message);
    }
    return res.json() as Promise<T>;
  }

  return {
    get token() {
      return token;
    },
    setToken,
    clearToken,

    devLogin: async (userId) => {
      const r = await request<{ accessToken: string }>('/auth/dev/login', { query: { userId } });
      setToken(r.accessToken);
      return r;
    },
    me: () => request<Me>('/me'),

    listAgents: () => request<{ agents: Agent[] }>('/agents'),
    listAgentScenes: () => request<{ scenes: AgentScene[] }>('/agent-scenes'),
    myQuota: () => request<QuotaUsage>('/me/quota'),
    listFavorites: () => request<{ ids: string[] }>('/me/favorites'),
    addFavorite: (agentId) => request<{ ids: string[] }>(`/me/favorites/${agentId}`, { method: 'POST', body: {} }),
    removeFavorite: (agentId) => request<{ ids: string[] }>(`/me/favorites/${agentId}`, { method: 'DELETE' }),
    cancelTask: (id) => request<{ task: TaskView; notice: string }>(`/tasks/${id}/cancel`, { method: 'POST', body: {} }),
    listKbDocuments: () => request<{ documents: KbDocument[] }>('/kb/documents'),
    searchKb: (query, limit) => request<{ hits: KbSearchHit[]; mode: string }>('/kb/search', { method: 'POST', body: { query, limit } }),
    listGraphs: () => request<{ graphs: GraphProduct[] }>('/graphs'),
    runGraph: (id, task) => request<{ run: GraphRunView }>(`/graphs/${id}/run`, { method: 'POST', body: { task } }),
    getGraphRun: (id) => request<{ run: GraphRunView }>(`/graph-runs/${id}`),
    listSessions: () => request<{ sessions: SessionRow[] }>('/sessions'),
    createSession: (agentPresetId) => request<{ sessionId: string; routingSecret: string }>('/sessions', { method: 'POST', body: { agentPresetId } }),
    getSession: (id) => request<{ id: string; status: string; agentPresetId: string }>(`/sessions/${id}`),
    closeSession: (id) => request<{ ok: boolean }>(`/sessions/${id}/close`, { method: 'POST', body: {} }),
    listTasks: () => request<{ tasks: TaskView[] }>('/tasks'),
    submitTask: (agentPresetId, task, sessionId) =>
      request<TaskSubmitResult>('/tasks', {
        method: 'POST',
        body: { agentPresetId, task, ...(sessionId ? { sessionId } : {}) },
      }),
    getTask: (id) => request<{ task: TaskView }>(`/tasks/${id}`),
    answerTaskInquiry: (id, body) =>
      request<{ task: TaskView }>(`/tasks/${id}/inquiry`, { method: 'POST', body }),
    proposeAgent: (body) => request<{ agent: Agent; notice: string }>('/agents/propose', { method: 'POST', body }),

    // 定时 Agent（20）用户侧
    listScheduled: () => request<{ tasks: ScheduledTask[] }>('/scheduled-tasks'),
    createScheduled: (body: { name: string; schedule: string; taskTemplate: string; agentPresetId?: string; timezone?: string }) => request<{ task: ScheduledTask; notice: string }>('/scheduled-tasks', { method: 'POST', body }),
    runScheduled: (id: string) => request<{ ok: boolean; detail?: string }>(`/scheduled-tasks/${id}/run-now`, { method: 'POST', body: {} }),
    setScheduledStatus: (id: string, action: 'pause' | 'resume') => request<{ task: ScheduledTask; notice: string }>(`/scheduled-tasks/${id}/${action}`, { method: 'POST', body: {} }),
    removeScheduled: (id: string) => request<{ ok: boolean }>(`/scheduled-tasks/${id}`, { method: 'DELETE' }),
    scheduleRuns: (id: string) => request<{ runs: ScheduledRunLog[] }>(`/scheduled-tasks/${id}/runs`),
    myApprovals: () => request<{ approvals: Approval[] }>('/approvals/mine'),
    cancelApproval: (id: string) => request<{ ok: boolean; notice?: string }>(`/approvals/${id}/cancel`, { method: 'POST', body: {} }),

    capabilities: () => request<CapabilityCatalog>('/capabilities'),
    getSpec: (id) => request<SpecView>(`/agents/${id}/spec`),
    putSpec: (id, spec, expectedUpdatedAt) => request<{ notice: string }>(`/agents/${id}/spec`, { method: 'PUT', body: { spec, expectedUpdatedAt } }),
    previewSpec: (id, spec) => request<PreviewResult>(`/agents/${id}/validate`, { method: 'POST', body: { spec } }),
    publishSpec: (id, expectedVersion) => request<{ agent: Agent; version: number; notice: string }>(`/admin/agents/${id}/publish`, { method: 'POST', body: { expectedVersion } }),
    listRevisions: (id) => request<{ revisions: Revision[] }>(`/admin/agents/${id}/revisions`),
    rollback: (id, toVersion) => request<{ agent: Agent; version: number; notice: string }>(`/admin/agents/${id}/rollback`, { method: 'POST', body: { toVersion } }),

    listSkills: () => request<{ skills: SkillItem[] }>('/skills'),
    createSkill: (body) => request<{ skill: SkillItem; notice: string }>('/skills', { method: 'POST', body }),
    getSkill: (id) => request<{ skill: SkillItem }>(`/skills/${id}`),
    patchSkill: (id, body) => request<{ skill: SkillItem; notice: string }>(`/skills/${id}`, { method: 'PATCH', body }),
    submitSkill: (id) => request<{ skill: SkillItem; notice: string }>(`/skills/${id}/submit`, { method: 'POST', body: {} }),
    archiveSkill: (id) => request<{ skill: SkillItem; notice: string }>(`/skills/${id}/archive`, { method: 'POST', body: {} }),
    listSkillVersions: (id) => request<{ versions: SkillVersionView[] }>(`/skills/${id}/versions`),
    addSkillVersion: (id, body) => request<{ skill: SkillItem; notice: string }>(`/skills/${id}/versions`, { method: 'POST', body }),
    reviewSkill: (id, vid, body) => request<{ skill: SkillItem; notice: string }>(`/skills/${id}/versions/${vid}/review`, { method: 'POST', body }),
    skillFeedback: (id, kind) => request<{ skill: SkillItem }>(`/skills/${id}/feedback`, { method: 'POST', body: { kind } }),
    listChangeRequests: (id) => request<{ changeRequests: ChangeRequestView[] }>(`/skills/${id}/change-requests`),
    addChangeRequest: (id, body) => request<{ changeRequest: ChangeRequestView; notice: string }>(`/skills/${id}/change-requests`, { method: 'POST', body }),
    handleChangeRequest: (id, body) => request<{ changeRequest: ChangeRequestView }>(`/change-requests/${id}`, { method: 'PATCH', body }),
    listNotifications: () => request<{ notifications: InboxNote[]; unread: number }>('/notifications'),
    readNotifications: (ids) => request<{ notifications: InboxNote[]; unread: number }>('/notifications/read', { method: 'POST', body: { ids } }),

    admin: {
      pendingApprovals: () => request<{ approvals: Approval[] }>('/admin/approvals/pending'),
      decideApproval: (id, approve) => request(`/admin/approvals/${id}/decide`, { method: 'POST', body: { approve } }),
      statsUsage: () => request<{ stats: StatsBody }>('/admin/stats/usage'),
      quotaPolicies: () => request<{ policies: QuotaPolicy[] }>('/admin/quota/policies'),
      setQuotaPolicy: (policy) => request('/admin/quota/policies', { method: 'POST', body: policy }),
      quotaAlerts: () => request<{ alerts: QuotaAlert[] }>('/admin/quota/alerts'),
      resolveQuotaAlert: (id) => request<{ ok: boolean; alerts: QuotaAlert[] }>('/admin/quota/alerts/' + id + '/resolve', { method: 'POST', body: {} }),
      allAgents: () => request<{ agents: Agent[] }>('/admin/agents'),
      createAgent: (body) => request<{ agent: Agent; notice: string }>('/admin/agents', { method: 'POST', body }),
      removeAgent: (id) => request<{ notice: string }>(`/admin/agents/${id}`, { method: 'DELETE' }),
      publishAgent: (id, publish) => request(`/admin/agents/${id}/${publish ? 'publish' : 'unpublish'}`, { method: 'POST', body: {} }),
      enableIm: (id, body) => request<{ binding: ImAgentBinding; notice: string }>(`/admin/agents/${id}/im`, { method: 'POST', body }),
      disableIm: (id) => request<{ binding: ImAgentBinding; notice: string }>(`/admin/agents/${id}/im`, { method: 'DELETE' }),
      getIm: (id) => request<{ binding: ImAgentBinding | null }>(`/admin/agents/${id}/im`),
      imBindings: () => request<{ bindings: ImAgentBinding[] }>('/admin/im/bindings'),
      imStatus: () => request<ImStatus>('/admin/im/status'),
      users: () => request<{ users: User[] }>('/admin/users'),
      patchUser: (id, patch) => request(`/admin/users/${id}`, { method: 'POST', body: patch }),
      sessions: (query) => request<{ sessions: SessionRow[] }>('/admin/sessions', { query }),
      session: (id) => request<{ session: SessionRow; events: AuditEvent[] }>(`/admin/sessions/${id}`),
      instances: () => request<{ count: number; instances: Instance[] }>('/admin/instances'),
      stopInstance: (id) => request(`/admin/instances/${id}/stop`, { method: 'POST', body: {} }),
      reapIdle: () => request<{ reaped: string[] }>('/admin/instances/reap', { method: 'POST', body: {} }),
      permissions: () => request<{ deptOverlays: Record<string, string>; matrix: Record<string, string[]>; rolePresets: Record<string, string>; presets: string[] }>('/admin/permissions'),
      setOverlay: (dept, preset) => request('/admin/permissions/overlays', { method: 'PUT', body: { dept, preset } }),
      models: () => request<ModelsBody>('/admin/models'),
      auditEvents: (query) => request<{ events: AuditEvent[] }>('/admin/audit/events', { query }),
      allScheduled: () => request<{ tasks: ScheduledTask[] }>('/admin/scheduled-tasks'),
      scheduledRuns: (query) => request<{ runs: ScheduledRunLog[] }>('/admin/scheduled-runs', { query }),
      roles: () => request<{ roles: RoleDef[] }>('/admin/roles'),
      upsertRole: (body) => request<{ ok: boolean; roles: RoleDef[] }>('/admin/roles', { method: 'POST', body }),
      removeRole: (name) => request<{ ok: boolean; roles: RoleDef[] }>('/admin/roles/' + encodeURIComponent(name), { method: 'DELETE' }),
      setApprovalChain: (id, roles) => request<{ roles: string[] }>('/admin/agents/' + id + '/approval-chain', { method: 'PUT', body: { roles } }),
      kbDocuments: () => request<{ documents: KbDocument[] }>('/admin/kb/documents'),
      kbStatus: () => request<KbStatus>('/admin/kb/status'),
      uploadKbDocument: (name, contentBase64, visibility) => request('/admin/kb/documents', { method: 'POST', body: { name, contentBase64, visibility } }),
      patchKbVisibility: (name, visibility) => request('/admin/kb/documents/' + encodeURIComponent(name) + '/visibility', { method: 'PATCH', body: visibility }),
      deleteKbDocument: (name) => request('/admin/kb/documents/' + encodeURIComponent(name), { method: 'DELETE' }),
      triggerKbIngest: () => request('/admin/kb/ingest', { method: 'POST', body: {} }),
      kbSearch: (body) => request('/admin/kb/search', { method: 'POST', body }),
      kbAudit: (limit = 50) => request('/admin/kb/audit', { query: { limit: String(limit) } }),
      connectors: () => request('/admin/connectors'),
      putConnector: (id, body) => request(`/admin/connectors/${id}`, { method: 'PUT', body }),
      publishConnector: (id) => request(`/admin/connectors/${id}/publish`, { method: 'POST', body: {} }),
      tools: () => request('/admin/tools'),
      putTool: (id, body) => request(`/admin/tools/${id}`, { method: 'PUT', body }),
      publishTool: (id) => request(`/admin/tools/${id}/publish`, { method: 'POST', body: {} }),
      graphs: () => request('/admin/graphs'),
      getGraph: (id) => request(`/admin/graphs/${id}`),
      putGraph: (id, body) => request(`/admin/graphs/${id}`, { method: 'PUT', body }),
      publishGraph: (id) => request(`/admin/graphs/${id}/publish`, { method: 'POST', body: {} }),
      unpublishGraph: (id) => request(`/admin/graphs/${id}/unpublish`, { method: 'POST', body: {} }),
      graphRevisions: (id) => request(`/admin/graphs/${id}/revisions`),
      rollbackGraph: (id, toVersion) => request(`/admin/graphs/${id}/rollback`, { method: 'POST', body: { toVersion } }),
      trialGraph: (id, task) => request(`/admin/graphs/${id}/trial`, { method: 'POST', body: { task } }),
      latestGraphRun: (id) => request(`/admin/graphs/${id}/latest-run`),
    },
  };
}

function defaultStorage(): TokenStore {
  if (typeof localStorage !== 'undefined') return localStorage;
  return safeStorage();
}

function safeStorage(): TokenStore {
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  };
}
