// store-client.ts — typed client over the control-plane HTTP seam (deep module).
//
// Small interface: domain-named methods (`listAgents`, `createSession`,
// `admin.users`, `admin.auditEvents`, …). The implementation absorbs the raw
// HTTP facts: base URL, auth header, token persistence, JSON (de)serialization,
// query-string cleanup, and error-message extraction. Views never touch a path,
// payload shape, or field name.

import type { Agent, AgentSpec, Approval, AuditEvent, CapabilityCatalog, Instance, Me, ModelsBody, PreviewResult, QuotaPolicy, Revision, SessionRow, SpecView, StatsBody, TaskSubmitResult, TaskView, User } from './types';

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
  listSessions(): Promise<{ sessions: SessionRow[] }>;
  createSession(agentPresetId: string): Promise<{ sessionId: string; routingSecret: string }>;
  getSession(id: string): Promise<{ id: string; status: string; agentPresetId: string }>;
  submitTask(agentPresetId: string, task: string): Promise<TaskSubmitResult>;
  getTask(id: string): Promise<{ task: TaskView }>;
  proposeAgent(body: { id: string; name: string; description: string; basedOn: string }): Promise<{ agent: Agent; notice: string }>;

  // ── Agent 编排（agent-orchestration-design.md §8）──
  capabilities(): Promise<CapabilityCatalog>;
  getSpec(id: string): Promise<SpecView>;
  putSpec(id: string, spec: AgentSpec, expectedUpdatedAt?: string): Promise<{ notice: string }>;
  previewSpec(id: string, spec: AgentSpec): Promise<PreviewResult>;
  publishSpec(id: string, expectedVersion: number): Promise<{ agent: Agent; version: number; notice: string }>;
  listRevisions(id: string): Promise<{ revisions: Revision[] }>;
  rollback(id: string, toVersion: number): Promise<{ agent: Agent; version: number; notice: string }>;

  admin: {
    pendingApprovals(): Promise<{ approvals: Approval[] }>;
    decideApproval(id: string, approve: boolean): Promise<unknown>;
    statsUsage(): Promise<{ stats: StatsBody }>;
    quotaPolicies(): Promise<{ policies: QuotaPolicy[] }>;
    setQuotaPolicy(policy: { scopeType: string; scopeId?: string; period: string; budgetRequests: number }): Promise<unknown>;
    allAgents(): Promise<{ agents: Agent[] }>;
    publishAgent(id: string, publish: boolean): Promise<unknown>;
    users(): Promise<{ users: User[] }>;
    patchUser(id: string, patch: { dept?: string; role?: string; status?: string }): Promise<unknown>;
    sessions(query: Record<string, string | undefined>): Promise<{ sessions: SessionRow[] }>;
    session(id: string): Promise<{ session: SessionRow; events: AuditEvent[] }>;
    instances(): Promise<{ count: number; instances: Instance[] }>;
    stopInstance(id: string): Promise<unknown>;
    reapIdle(): Promise<{ reaped: string[] }>;
    permissions(): Promise<{ deptOverlays: Record<string, string> }>;
    setOverlay(dept: string, preset: string | null): Promise<unknown>;
    models(): Promise<ModelsBody>;
    auditEvents(query: Record<string, string>): Promise<{ events: AuditEvent[] }>;
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
    listSessions: () => request<{ sessions: SessionRow[] }>('/sessions'),
    createSession: (agentPresetId) => request<{ sessionId: string; routingSecret: string }>('/sessions', { method: 'POST', body: { agentPresetId } }),
    getSession: (id) => request<{ id: string; status: string; agentPresetId: string }>(`/sessions/${id}`),
    submitTask: (agentPresetId, task) => request<TaskSubmitResult>('/tasks', { method: 'POST', body: { agentPresetId, task } }),
    getTask: (id) => request<{ task: TaskView }>(`/tasks/${id}`),
    proposeAgent: (body) => request<{ agent: Agent; notice: string }>('/agents/propose', { method: 'POST', body }),

    capabilities: () => request<CapabilityCatalog>('/capabilities'),
    getSpec: (id) => request<SpecView>(`/agents/${id}/spec`),
    putSpec: (id, spec, expectedUpdatedAt) => request<{ notice: string }>(`/agents/${id}/spec`, { method: 'PUT', body: { spec, expectedUpdatedAt } }),
    previewSpec: (id, spec) => request<PreviewResult>(`/agents/${id}/validate`, { method: 'POST', body: { spec } }),
    publishSpec: (id, expectedVersion) => request<{ agent: Agent; version: number; notice: string }>(`/admin/agents/${id}/publish`, { method: 'POST', body: { expectedVersion } }),
    listRevisions: (id) => request<{ revisions: Revision[] }>(`/admin/agents/${id}/revisions`),
    rollback: (id, toVersion) => request<{ agent: Agent; version: number; notice: string }>(`/admin/agents/${id}/rollback`, { method: 'POST', body: { toVersion } }),

    admin: {
      pendingApprovals: () => request<{ approvals: Approval[] }>('/admin/approvals/pending'),
      decideApproval: (id, approve) => request(`/admin/approvals/${id}/decide`, { method: 'POST', body: { approve } }),
      statsUsage: () => request<{ stats: StatsBody }>('/admin/stats/usage'),
      quotaPolicies: () => request<{ policies: QuotaPolicy[] }>('/admin/quota/policies'),
      setQuotaPolicy: (policy) => request('/admin/quota/policies', { method: 'POST', body: policy }),
      allAgents: () => request<{ agents: Agent[] }>('/admin/agents'),
      publishAgent: (id, publish) => request(`/admin/agents/${id}/${publish ? 'publish' : 'unpublish'}`, { method: 'POST', body: {} }),
      users: () => request<{ users: User[] }>('/admin/users'),
      patchUser: (id, patch) => request(`/admin/users/${id}`, { method: 'POST', body: patch }),
      sessions: (query) => request<{ sessions: SessionRow[] }>('/admin/sessions', { query }),
      session: (id) => request<{ session: SessionRow; events: AuditEvent[] }>(`/admin/sessions/${id}`),
      instances: () => request<{ count: number; instances: Instance[] }>('/admin/instances'),
      stopInstance: (id) => request(`/admin/instances/${id}/stop`, { method: 'POST', body: {} }),
      reapIdle: () => request<{ reaped: string[] }>('/admin/instances/reap', { method: 'POST', body: {} }),
      permissions: () => request<{ deptOverlays: Record<string, string> }>('/admin/permissions'),
      setOverlay: (dept, preset) => request('/admin/permissions/overlays', { method: 'PUT', body: { dept, preset } }),
      models: () => request<ModelsBody>('/admin/models'),
      auditEvents: (query) => request<{ events: AuditEvent[] }>('/admin/audit/events', { query }),
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
