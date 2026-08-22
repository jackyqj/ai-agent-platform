import { useEffect, useRef, useState } from 'react';
import { createClient, type Client } from './store-client';
import type { AdminPane, AgentSpec, AppState, Route } from './types';
import { localToIso } from './util';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
export const API_HOST_DISPLAY = 'http://127.0.0.1:4000';

const initial: AppState = {
  me: null,
  route: 'store',
  loading: false,
  loginUser: 'u-admin',
  showDevLogin: false,
  toast: null,
  toastErr: false,

  agents: [],
  agentBusy: {},
  mySessions: [],
  schedTasks: [],
  schedRuns: [],
  allSched: [],
  schedFailRuns: [],
  schedForm: { name: '', schedule: 'daily 09:00', template: '', tz: 'Asia/Shanghai' },
  chat: null,
  adminPane: 'workbench',
  showPropose: false,

  pId: '',
  pName: '',
  pDesc: '',
  pBased: 'assistant',

  approvals: [],
  allAgents: [],
  stats: null,
  quotas: [],
  quotaAlerts: [],
  users: [],
  userEdits: {},
  userFilter: '',
  roleDefs: [],
  roleForm: { name: '', permissions: [], dshPreset: 'workspace-write' },
  sessions: [],
  sessUser: '',
  sessDept: '',
  sessFrom: '',
  selectedSessionId: '',
  sessionDetail: null,
  instances: null,
  rbac: null,
  permKeys: [],
  presetKeys: [],
  models: null,
  audit: [],
  auditUser: '',
  auditSession: '',
  auditType: '',

  qScope: 'all',
  qScopeId: '',
  qBudget: '20',
  ovDept: '',
  ovPreset: 'workspace-write',

  errors: {},
  compose: null,
};

export interface Actions {
  update(patch: Partial<AppState>): void;
  notify(msg: string, err?: boolean): void;
  login(): Promise<void>;
  logout(): void;
  loadStore(): Promise<void>;
  loadAdminData(): Promise<void>;
  startChat(agentId: string): Promise<void>;
  openChat(sessionId: string, agentId: string): void;
  closeChat(): void;
  sendMessage(agentId: string, text: string): Promise<string>;
  propose(): Promise<void>;
  decide(id: string, approve: boolean): Promise<void>;
  toggleAgent(id: string, status: string): Promise<void>;
  createAgent(): Promise<void>;
  removeAgent(id: string): Promise<void>;
  openCompose(agentId: string): Promise<void>;
  closeCompose(): void;
  editComposeSpec(patch: Partial<AgentSpec>): void;
  refreshComposePreview(): Promise<void>;
  saveComposeSpec(): Promise<void>;
  publishCompose(): Promise<void>;
  rollbackCompose(toVersion: number): Promise<void>;
  setQuota(): Promise<void>;
  resolveQuotaAlert(id: string): Promise<void>;
  loadScheduled(): Promise<void>;
  setSchedForm(patch: Partial<AppState['schedForm']>): void;
  createScheduled(): Promise<void>;
  runScheduled(id: string): Promise<void>;
  setScheduledStatus(id: string, status: 'pause' | 'resume'): Promise<void>;
  removeScheduled(id: string): Promise<void>;
  loadSchedRuns(id: string): Promise<void>;
  setRoleForm(patch: Partial<AppState['roleForm']>): void;
  upsertRole(): Promise<void>;
  removeRole(name: string): Promise<void>;
  focusUser(id: string): void;
  editUser(id: string, patch: { dept?: string; role?: string }): void;
  saveUser(id: string): Promise<void>;
  setStatus(id: string, status: string): Promise<void>;
  loadSessions(): Promise<void>;
  clearSessionFilter(): void;
  openSession(id: string): Promise<void>;
  stopInstance(id: string): Promise<void>;
  reapIdle(): Promise<void>;
  saveOverlay(): Promise<void>;
  clearOverlay(): Promise<void>;
  loadAudit(): Promise<void>;
}

export function useApp(clientOverride?: Client): { state: AppState; act: Actions } {
  const clientRef = useRef<Client | null>(null);
  if (!clientRef.current) clientRef.current = clientOverride ?? createClient({ baseUrl: API_BASE });
  const client = clientRef.current;

  const [state, setState] = useState<AppState>(initial);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function update(patch: Partial<AppState>) {
    setState((prev) => ({ ...prev, ...patch }));
  }

  function notify(msg: string, err = false) {
    setState((prev) => ({ ...prev, toast: msg, toastErr: err }));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setState((prev) => ({ ...prev, toast: null })), 4200);
  }

  async function loadStore() {
    try {
      const [agentsRes, sessionsRes, schedRes] = await Promise.all([
        client.listAgents(),
        client.listSessions().catch(() => ({ sessions: [] as AppState['mySessions'] })),
        client.listScheduled().catch(() => ({ tasks: [] as AppState['schedTasks'] })),
      ]);
      setState((prev) => ({
        ...prev,
        agents: agentsRes.agents || [],
        mySessions: (sessionsRes.sessions || []).filter((s) => s.status !== 'closed'),
        schedTasks: schedRes.tasks || [],
      }));
    } catch (e) {
      notify('加载商店失败：' + (e as Error).message, true);
    }
  }

  async function fetchSessions(query: Record<string, string | undefined>) {
    const r = await client.admin.sessions(query);
    setState((prev) => ({ ...prev, sessions: r.sessions || [] }));
  }

  async function fetchAudit(query: Record<string, string>) {
    const r = await client.admin.auditEvents(query);
    setState((prev) => ({ ...prev, audit: r.events || [] }));
  }

  function recordError(key: string) {
    return (e: unknown) => setState((prev) => ({ ...prev, errors: { ...prev.errors, [key]: (e as Error).message } }));
  }

  async function loadAdminData() {
    const jobs: Promise<unknown>[] = [
      client.admin.pendingApprovals().then((r) => setState((prev) => ({ ...prev, approvals: r.approvals || [] }))),
      client.admin.allAgents().then((r) => setState((prev) => ({ ...prev, allAgents: r.agents || [] }))),
      client.admin.statsUsage().then((r) => setState((prev) => ({ ...prev, stats: r }))).catch(recordError('stats')),
      client.admin.quotaPolicies().then((r) => setState((prev) => ({ ...prev, quotas: r.policies || [] }))),
      client.admin.quotaAlerts().then((r) => setState((prev) => ({ ...prev, quotaAlerts: r.alerts || [] }))),
      client.admin.users().then((r) => setState((prev) => {
        const userEdits = { ...prev.userEdits };
        for (const u of r.users || []) if (!userEdits[u.id]) userEdits[u.id] = { dept: u.dept || '', role: u.role };
        return { ...prev, users: r.users || [], userEdits };
      })),
      fetchSessions({ userId: state.sessUser, dept: state.sessDept, from: localToIso(state.sessFrom) }),
      client.admin.instances().then((r) => setState((prev) => ({ ...prev, instances: r }))).catch(recordError('instances')),
      client.admin.permissions().then((r) => setState((prev) => ({ ...prev, rbac: r, permKeys: Object.keys(r.matrix || {}), presetKeys: r.presets || [] }))).catch(recordError('rbac')),
      client.admin.models().then((r) => setState((prev) => ({ ...prev, models: r }))).catch(recordError('models')),
      client.admin.allScheduled().then((r) => setState((prev) => ({ ...prev, allSched: r.tasks || [] }))).catch(recordError('sched')),
      client.admin.scheduledRuns({ status: 'failed' }).then((r) => setState((prev) => ({ ...prev, schedFailRuns: r.runs || [] }))).catch(recordError('schedRuns')),
      client.admin.roles().then((r) => setState((prev) => ({ ...prev, roleDefs: r.roles || [] }))).catch(recordError('roles')),
      fetchAudit({
        limit: '50',
        ...(state.auditUser ? { userId: state.auditUser } : {}),
        ...(state.auditSession ? { sessionId: state.auditSession } : {}),
        ...(state.auditType ? { eventType: state.auditType } : {}),
      }),
    ];
    await Promise.allSettled(jobs);
  }

  async function login() {
    update({ loading: true });
    try {
      await client.devLogin(state.loginUser);
      const me = await client.me();
      const parsed = parseLocation(location.hash, me.role);
      update({ me, route: parsed.route, adminPane: parsed.adminPane, showDevLogin: false });
      await loadStore();
      if (me.role === 'admin') await loadAdminData();
      notify('已登录：' + me.name);
    } catch (e) {
      notify('登录失败：' + (e as Error).message, true);
    }
    update({ loading: false });
  }

  function logout() {
    client.clearToken();
    setState(initial);
  }

  function openChat(sessionId: string, agentId: string) {
    setState((prev) => ({
      ...prev,
      route: 'chat',
      chat: { sessionId, agentId, error: null },
    }));
    history.replaceState(null, '', '#chat');
  }

  function closeChat() {
    setState((prev) => ({ ...prev, route: 'store', chat: null }));
    history.replaceState(null, '', '#store');
  }

  async function startChat(agentId: string) {
    const existing = state.mySessions.find((s) => s.agentPresetId === agentId && s.status !== 'closed');
    if (existing) {
      openChat(existing.id, agentId);
      return;
    }
    setState((prev) => ({ ...prev, agentBusy: { ...prev.agentBusy, [agentId]: true } }));
    try {
      const r = await client.createSession(agentId);
      await loadStore();
      openChat(r.sessionId, agentId);
    } catch {
      setState((prev) => ({
        ...prev,
        route: 'chat',
        chat: { sessionId: null, agentId, error: '实例还没起来，请稍后重试' },
      }));
      history.replaceState(null, '', '#chat');
    }
    setState((prev) => ({ ...prev, agentBusy: { ...prev.agentBusy, [agentId]: false } }));
  }

  async function sendMessage(agentId: string, text: string): Promise<string> {
    const r = await client.submitTask(agentId, text);
    if (r.awaitingApproval) return '已提交，等待审批通过后执行。';
    for (let i = 0; i < 40; i++) {
      const g = await client.getTask(r.taskId);
      if (g.task.status === 'done') return g.task.result?.finalResponse ?? '（无回复）';
      if (g.task.status === 'failed') throw new Error(g.task.error || '任务失败');
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return '仍在执行。刷新对话或稍后再看结果。';
  }

  async function propose() {
    try {
      const r = await client.proposeAgent({ id: state.pId, name: state.pName, description: state.pDesc, basedOn: state.pBased });
      notify(r.notice + '（' + r.agent.id + '）');
      update({ pId: '', pName: '', pDesc: '', pBased: 'assistant' });
    } catch (e) {
      notify('提审失败：' + (e as Error).message, true);
    }
  }

  // ── Agent 编排（agent-orchestration-design.md §9）──

  async function loadCompose(agentId: string) {
    const [catalog, specView, revisions] = await Promise.all([
      client.capabilities(),
      client.getSpec(agentId),
      client.listRevisions(agentId).catch(() => ({ revisions: [] })),
    ]);
    const preview = await client.previewSpec(agentId, specView.spec);
    setState((prev) => ({
      ...prev,
      compose: {
        agentId,
        spec: specView.spec,
        catalog,
        version: specView.version,
        dirty: specView.dirty,
        updatedBy: specView.updatedBy,
        updatedAt: specView.updatedAt,
        previewYaml: preview.yaml,
        issues: preview.validation.ok ? [] : (preview.validation.errors ?? []),
        revisions: revisions.revisions ?? [],
        saving: prev.compose?.saving ?? false,
        publishing: prev.compose?.publishing ?? false,
      },
    }));
  }

  async function openCompose(agentId: string) {
    try {
      await loadCompose(agentId);
    } catch (e) {
      notify('打开编排失败：' + (e as Error).message, true);
    }
  }

  function closeCompose() {
    setState((prev) => ({ ...prev, compose: null }));
  }

  function editComposeSpec(patch: Partial<AgentSpec>) {
    setState((prev) => {
      if (!prev.compose?.spec) return prev;
      return { ...prev, compose: { ...prev.compose, spec: { ...prev.compose.spec, ...patch }, dirty: true } };
    });
  }

  async function refreshComposePreview() {
    if (!state.compose?.spec) return;
    try {
      const preview = await client.previewSpec(state.compose.agentId, state.compose.spec);
      setState((prev) => prev.compose
        ? { ...prev, compose: { ...prev.compose, previewYaml: preview.yaml, issues: preview.validation.ok ? [] : (preview.validation.errors ?? []) } }
        : prev);
    } catch (e) {
      notify('预览失败：' + (e as Error).message, true);
    }
  }

  async function saveComposeSpec() {
    if (!state.compose?.spec) return;
    const { agentId, spec, updatedAt } = state.compose;
    setState((prev) => prev.compose ? { ...prev, compose: { ...prev.compose, saving: true } } : prev);
    try {
      await client.putSpec(agentId, spec, updatedAt);
      await loadCompose(agentId);
      notify('已保存草稿');
    } catch (e) {
      notify('保存失败：' + (e as Error).message, true);
    }
  }

  async function publishCompose() {
    if (!state.compose) return;
    const { agentId, version } = state.compose;
    setState((prev) => prev.compose ? { ...prev, compose: { ...prev.compose, publishing: true } } : prev);
    try {
      const r = await client.publishSpec(agentId, version);
      await loadCompose(agentId);
      await loadStore();
      notify('已发布 v' + r.version);
    } catch (e) {
      notify('发布失败：' + (e as Error).message, true);
    }
  }

  async function rollbackCompose(toVersion: number) {
    if (!state.compose) return;
    const { agentId } = state.compose;
    try {
      const r = await client.rollback(agentId, toVersion);
      await loadCompose(agentId);
      await loadStore();
      notify(r.notice);
    } catch (e) {
      notify('回滚失败：' + (e as Error).message, true);
    }
  }

  async function decide(id: string, approve: boolean) {
    try {
      await client.admin.decideApproval(id, approve);
      await Promise.all([loadAdminData(), loadStore()]);
      notify(approve ? '已批准' : '已拒绝');
    } catch (e) { notify('操作失败：' + (e as Error).message, true); }
  }

  async function toggleAgent(id: string, status: string) {
    try {
      await client.admin.publishAgent(id, status !== 'published');
      await Promise.all([loadAdminData(), loadStore()]);
      notify(status === 'published' ? '已下架' : '已上架');
    } catch (e) { notify('操作失败：' + (e as Error).message, true); }
  }

  async function createAgent() {
    try {
      const r = await client.admin.createAgent({ id: state.pId, name: state.pName, description: state.pDesc, basedOn: state.pBased });
      update({ pId: '', pName: '', pDesc: '', pBased: 'assistant' });
      await openCompose(r.agent.id);
      notify(r.notice + '（' + r.agent.id + '）');
    } catch (e) { notify('新建失败：' + (e as Error).message, true); }
  }

  async function removeAgent(id: string) {
    try {
      await client.admin.removeAgent(id);
      await Promise.all([loadAdminData(), loadStore()]);
      notify('已删除 ' + id);
    } catch (e) { notify('删除失败：' + (e as Error).message, true); }
  }

  async function setQuota() {
    try {
      await client.admin.setQuotaPolicy({
        scopeType: state.qScope,
        scopeId: state.qScope === 'all' ? undefined : state.qScopeId,
        period: 'day',
        budgetRequests: Number(state.qBudget),
      });
      await loadAdminData();
      notify('已设置配额');
    } catch (e) { notify('设置配额失败：' + (e as Error).message, true); }
  }

  async function resolveQuotaAlert(id: string) {
    try {
      const r = await client.admin.resolveQuotaAlert(id);
      setState((prev) => ({ ...prev, quotaAlerts: r.alerts || [] }));
      notify('已处置告警');
    } catch (e) { notify('处置告警失败：' + (e as Error).message, true); }
  }

  // ── 定时 Agent（20）──────────────────────────────────
  async function loadScheduled() {
    const r = await client.listScheduled();
    setState((prev) => ({ ...prev, schedTasks: r.tasks || [] }));
  }

  function setSchedForm(patch: Partial<AppState['schedForm']>) {
    setState((prev) => ({ ...prev, schedForm: { ...prev.schedForm, ...patch } }));
  }

  async function createScheduled() {
    try {
      const f = state.schedForm;
      await client.createScheduled({ name: f.name, schedule: f.schedule, taskTemplate: f.template, timezone: f.tz || undefined });
      await loadScheduled();
      notify('已创建定时任务');
    } catch (e) { notify('创建失败：' + (e as Error).message, true); }
  }

  async function runScheduled(id: string) {
    try {
      const r = await client.runScheduled(id);
      notify(r.detail || '已触发');
      await loadScheduled();
    } catch (e) { notify('触发失败：' + (e as Error).message, true); }
  }

  async function setScheduledStatus(id: string, status: 'pause' | 'resume') {
    try {
      const r = await client.setScheduledStatus(id, status);
      notify(r.notice);
      await loadScheduled();
    } catch (e) { notify('操作失败：' + (e as Error).message, true); }
  }

  async function removeScheduled(id: string) {
    try {
      await client.removeScheduled(id);
      notify('已删除');
      await loadScheduled();
    } catch (e) { notify('删除失败：' + (e as Error).message, true); }
  }

  async function loadSchedRuns(id: string) {
    try {
      const r = await client.scheduleRuns(id);
      setState((prev) => ({ ...prev, schedRuns: r.runs || [] }));
    } catch (e) { notify('加载运行历史失败：' + (e as Error).message, true); }
  }

  // ── 自定义角色（13）──────────────────────────────────
  function setRoleForm(patch: Partial<AppState['roleForm']>) {
    setState((prev) => ({ ...prev, roleForm: { ...prev.roleForm, ...patch } }));
  }

  async function upsertRole() {
    try {
      const f = state.roleForm;
      if (!f.name) { notify('角色名必填', true); return; }
      const r = await client.admin.upsertRole({ name: f.name, permissions: f.permissions, dshPreset: f.dshPreset });
      setState((prev) => ({ ...prev, roleDefs: r.roles || [], roleForm: { name: '', permissions: [], dshPreset: 'workspace-write' } }));
      notify('已保存角色');
    } catch (e) { notify('保存失败：' + (e as Error).message, true); }
  }

  async function removeRole(name: string) {
    try {
      const r = await client.admin.removeRole(name);
      setState((prev) => ({ ...prev, roleDefs: r.roles || [] }));
      notify('已删除角色');
    } catch (e) { notify('删除失败：' + (e as Error).message, true); }
  }

  function focusUser(id: string) {
    update({ sessUser: id, sessDept: '', auditUser: id });
    fetchSessions({ userId: id, dept: '', from: undefined }).catch((e) => notify('检索失败：' + (e as Error).message, true));
  }

  function editUser(id: string, patch: { dept?: string; role?: string }) {
    setState((prev) => {
      const cur = prev.userEdits[id] ?? { dept: '', role: '' };
      return { ...prev, userEdits: { ...prev.userEdits, [id]: { ...cur, ...patch } } };
    });
  }

  async function saveUser(id: string) {
    try {
      const edit = state.userEdits[id];
      await client.admin.patchUser(id, { dept: edit.dept, role: edit.role });
      await loadAdminData();
      notify('已保存 ' + id);
    } catch (e) { notify('保存失败：' + (e as Error).message, true); }
  }

  async function setStatus(id: string, status: string) {
    try {
      await client.admin.patchUser(id, { status });
      await loadAdminData();
      notify(status === 'disabled' ? '已禁用并回收实例：' + id : '已启用：' + id);
    } catch (e) { notify('状态更新失败：' + (e as Error).message, true); }
  }

  async function loadSessions() {
    try {
      await fetchSessions({ userId: state.sessUser, dept: state.sessDept, from: localToIso(state.sessFrom) });
    } catch (e) { notify('检索失败：' + (e as Error).message, true); }
  }

  function clearSessionFilter() {
    update({ sessUser: '', sessDept: '', sessFrom: '', selectedSessionId: '' });
    fetchSessions({ userId: '', dept: '', from: undefined }).catch((e) => notify('检索失败：' + (e as Error).message, true));
  }

  async function openSession(id: string) {
    update({ selectedSessionId: id, auditSession: id });
    try {
      const r = await client.admin.session(id);
      const ev = (r.events || []).map((e) => `${e.ts}  ${e.eventType}  ${JSON.stringify(e.payload ?? {})}`).join('\n');
      update({ sessionDetail: { session: r.session, ev } });
    } catch (e) {
      update({ sessionDetail: { session: { id }, ev: '', err: (e as Error).message } });
    }
  }

  async function stopInstance(id: string) {
    try {
      await client.admin.stopInstance(id);
      await loadAdminData();
      notify('已回收实例');
    } catch (e) { notify('回收失败：' + (e as Error).message, true); }
  }

  async function reapIdle() {
    try {
      const r = await client.admin.reapIdle();
      await loadAdminData();
      notify('回收空闲：' + ((r.reaped || []).join(',') || '无'));
    } catch (e) { notify('回收失败：' + (e as Error).message, true); }
  }

  async function saveOverlay() {
    try {
      await client.admin.setOverlay(state.ovDept.trim(), state.ovPreset);
      await loadAdminData();
      notify('已设置部门覆盖：' + state.ovDept);
    } catch (e) { notify('设置失败：' + (e as Error).message, true); }
  }

  async function clearOverlay() {
    try {
      await client.admin.setOverlay(state.ovDept.trim(), null);
      await loadAdminData();
      notify('已清除部门覆盖：' + state.ovDept);
    } catch (e) { notify('清除失败：' + (e as Error).message, true); }
  }

  async function loadAudit() {
    try {
      await fetchAudit({
        limit: '50',
        ...(state.auditUser ? { userId: state.auditUser } : {}),
        ...(state.auditSession ? { sessionId: state.auditSession } : {}),
        ...(state.auditType ? { eventType: state.auditType } : {}),
      });
    } catch (e) { notify('查询失败：' + (e as Error).message, true); }
  }

  // Restore a stored session on first mount. SSO callback lands on #token=.
  useEffect(() => {
    const raw = location.hash.replace(/^#/, '');
    const ssoToken = new URLSearchParams(raw).get('token');
    if (ssoToken) {
      client.setToken(ssoToken);
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (!client.token) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await client.me();
        if (cancelled) return;
        const parsed = parseLocation(ssoToken ? '' : location.hash, me.role);
        setState((prev) => ({ ...prev, me, route: parsed.route, adminPane: parsed.adminPane }));
        await loadStore();
        if (me.role === 'admin') await loadAdminData();
      } catch {
        if (!cancelled) {
          client.clearToken();
          setState((prev) => ({ ...prev, me: null }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act: Actions = {
    update, notify, login, logout, loadStore, loadAdminData, startChat, openChat, closeChat, sendMessage, propose,
    decide, toggleAgent, createAgent, removeAgent, setQuota, resolveQuotaAlert, loadScheduled, setSchedForm, createScheduled, runScheduled, setScheduledStatus, removeScheduled, loadSchedRuns, setRoleForm, upsertRole, removeRole, focusUser, editUser, saveUser, setStatus,
    loadSessions, clearSessionFilter, openSession, stopInstance, reapIdle,
    saveOverlay, clearOverlay, loadAudit,
    openCompose, closeCompose, editComposeSpec, refreshComposePreview, saveComposeSpec, publishCompose, rollbackCompose,
  };

  return { state, act };
}

export function parseLocation(hash: string, role: string): { route: Route; adminPane: AdminPane } {
  const h = hash.replace(/^#/, '');
  if (h === 'chat' || h.startsWith('chat/')) return { route: 'chat', adminPane: 'workbench' };
  if (h.startsWith('admin')) {
    if (role !== 'admin') return { route: 'store', adminPane: 'workbench' };
    const adminPane: AdminPane = h === 'admin/config' ? 'config' : h === 'admin/investigate' ? 'investigate' : 'workbench';
    return { route: 'admin', adminPane };
  }
  return { route: 'store', adminPane: 'workbench' };
}
