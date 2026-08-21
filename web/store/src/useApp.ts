import { useEffect, useRef, useState } from 'react';
import { createClient, type Client } from './store-client';
import type { AppState, Route } from './types';
import { localToIso } from './util';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
export const API_HOST_DISPLAY = 'http://127.0.0.1:4000';

const initial: AppState = {
  me: null,
  route: 'store',
  loading: false,
  loginUser: 'u-admin',
  toast: null,
  toastErr: false,

  agents: [],
  agentBusy: {},
  agentResults: {},

  pId: '',
  pName: '',
  pDesc: '',
  pBased: 'assistant',

  approvals: [],
  allAgents: [],
  stats: null,
  quotas: [],
  users: [],
  userEdits: {},
  userFilter: '',
  sessions: [],
  sessUser: '',
  sessDept: '',
  sessFrom: '',
  selectedSessionId: '',
  sessionDetail: null,
  instances: null,
  rbac: null,
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
};

export interface Actions {
  update(patch: Partial<AppState>): void;
  notify(msg: string, err?: boolean): void;
  login(): Promise<void>;
  logout(): void;
  loadStore(): Promise<void>;
  loadAdminData(): Promise<void>;
  useAgent(id: string): Promise<void>;
  propose(): Promise<void>;
  decide(id: string, approve: boolean): Promise<void>;
  toggleAgent(id: string, status: string): Promise<void>;
  setQuota(): Promise<void>;
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
      const r = await client.listAgents();
      setState((prev) => ({ ...prev, agents: r.agents || [] }));
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
      client.admin.users().then((r) => setState((prev) => {
        const userEdits = { ...prev.userEdits };
        for (const u of r.users || []) if (!userEdits[u.id]) userEdits[u.id] = { dept: u.dept || '', role: u.role };
        return { ...prev, users: r.users || [], userEdits };
      })),
      fetchSessions({ userId: state.sessUser, dept: state.sessDept, from: localToIso(state.sessFrom) }),
      client.admin.instances().then((r) => setState((prev) => ({ ...prev, instances: r }))).catch(recordError('instances')),
      client.admin.permissions().then((r) => setState((prev) => ({ ...prev, rbac: r }))).catch(recordError('rbac')),
      client.admin.models().then((r) => setState((prev) => ({ ...prev, models: r }))).catch(recordError('models')),
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
      const route: Route = location.hash === '#admin' && me.role === 'admin' ? 'admin' : 'store';
      update({ me, route });
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

  async function useAgent(id: string) {
    setState((prev) => ({ ...prev, agentBusy: { ...prev.agentBusy, [id]: true } }));
    try {
      const r = await client.createSession(id);
      setState((prev) => ({ ...prev, agentResults: { ...prev.agentResults, [id]: '会话 ' + r.sessionId + '\n密钥 ' + r.routingSecret } }));
    } catch (e) {
      setState((prev) => ({ ...prev, agentResults: { ...prev.agentResults, [id]: '失败：' + (e as Error).message } }));
    }
    setState((prev) => ({ ...prev, agentBusy: { ...prev.agentBusy, [id]: false } }));
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

  // Restore a stored session on first mount.
  useEffect(() => {
    if (!client.token) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await client.me();
        if (cancelled) return;
        const route: Route = location.hash === '#admin' && me.role === 'admin' ? 'admin' : 'store';
        setState((prev) => ({ ...prev, me, route }));
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
    update, notify, login, logout, loadStore, loadAdminData, useAgent, propose,
    decide, toggleAgent, setQuota, focusUser, editUser, saveUser, setStatus,
    loadSessions, clearSessionFilter, openSession, stopInstance, reapIdle,
    saveOverlay, clearOverlay, loadAudit,
  };

  return { state, act };
}
