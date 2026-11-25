import { useEffect, useRef, useState } from 'react';
import { createClient, type Client } from './store-client';
import { extractCitations, mergeCitations } from './chat-extract';
import { buildSessionTitles, extractQuestionHint, formatSessionTitle, isQuotaError, tasksToMessages, waitForTaskResult } from './chat-utils';
import { canKbManage, canSkillManage, isFullAdmin, validateKbFile } from './kb-utils';
import type { AdminPane, AgentSpec, AppState, ChatMessage, GraphComposeState, GraphNode, GraphSpec, KbVisibility, Me, Route, TaskView } from './types';
import { localToIso } from './util';
import { dropEdgesTouching, linearEdges, newStepId, wouldCreateCycle } from './graph-compose-utils';

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
  quota: null,
  favorites: [],
  storeScene: '',
  storeQuery: '',
  detailAgentId: null,
  employeeKbDocs: [],
  employeeKbHits: [],
  employeeKbQuery: '',
  employeeKbMode: '',
  graphs: [],
  graphBusy: {},
  graphTask: {},
  lastGraphRun: null,
  agentBusy: {},
  allGraphs: [],
  connectors: [],
  catalogTools: [],
  connForm: { id: '', name: '', kind: 'http', secretRef: '', baseUrl: 'https://', tables: '' },
  toolForm: { id: '', connectorId: '', name: '', path: '/v1/' },
  graphForm: { id: '', name: '' },
  mySessions: [],
  sessionTitles: {},
  myApprovals: [],
  schedTasks: [],
  schedRuns: [],
  allSched: [],
  schedFailRuns: [],
  schedForm: { name: '', schedule: 'daily 09:00', template: '', tz: 'Asia/Shanghai' },
  chat: null,
  adminPane: 'workbench',
  showPropose: false,

  skills: [],
  skillDetail: null,
  skillVersions: [],
  skillRequests: [],
  skillForm: { slug: '', title: '', description: '', body: '', version: '0.1.0', visibility: 'company', tags: '' },
  skillCreating: false,
  inbox: [],
  inboxUnread: 0,
  crDraft: null,

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

  kbDocuments: [],
  kbStatus: null,
  kbUploadClass: 'internal',
  kbSearchQuery: '',
  kbSearchDept: 'HR',
  kbSearchRole: 'employee',
  kbSearchHits: [],
  kbSearchMode: '',
  kbPendingUpload: null,
  kbAudit: [],

  errors: {},
  compose: null,
  graphCompose: null,
};

export interface Actions {
  update(patch: Partial<AppState>): void;
  notify(msg: string, err?: boolean): void;
  login(): Promise<void>;
  logout(): void;
  loadStore(): Promise<void>;
  loadAdminData(): Promise<void>;
  loadKbAdminData(): Promise<void>;
  startChat(agentId: string): Promise<void>;
  openChat(sessionId: string, agentId: string): Promise<void>;
  closeChat(): void;
  deleteSession(sessionId: string): Promise<void>;
  sendMessage(agentId: string, text: string): Promise<void>;
  cancelRun(): Promise<void>;
  toggleFavorite(agentId: string): Promise<void>;
  searchEmployeeKb(query?: string): Promise<void>;
  loadEmployeeKb(): Promise<void>;
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
  loadMyApprovals(): Promise<void>;
  cancelApproval(id: string): Promise<void>;
  setRoleForm(patch: Partial<AppState['roleForm']>): void;
  upsertRole(): Promise<void>;
  removeRole(name: string): Promise<void>;
  setAgentChain(id: string, roles: string[]): Promise<void>;
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
  uploadKb(file: File): Promise<void>;
  confirmKbUpload(): Promise<void>;
  deleteKb(name: string): Promise<void>;
  saveKbVisibility(name: string, visibility: KbVisibility): Promise<void>;
  triggerKbIngest(): Promise<void>;
  runKbSearch(): Promise<void>;
  runGraph(id: string): Promise<void>;
  saveConnector(): Promise<void>;
  publishConnector(id: string): Promise<void>;
  saveTool(): Promise<void>;
  publishTool(id: string): Promise<void>;
  saveGraphProduct(): Promise<void>;
  publishGraphProduct(id: string): Promise<void>;
  unpublishGraphProduct(id: string): Promise<void>;
  openSkill(id: string): Promise<void>;
  closeSkill(): void;
  createSkill(): Promise<void>;
  saveSkill(): Promise<void>;
  submitSkill(): Promise<void>;
  archiveSkill(): Promise<void>;
  voteSkill(kind: 'like' | 'dislike'): Promise<void>;
  reviewSkill(vid: string, decision: 'approve' | 'reject', comment?: string): Promise<void>;
  addSkillVersion(): Promise<void>;
  startChangeRequest(lineNo: number, originalText: string): void;
  submitChangeRequest(): Promise<void>;
  handleChangeRequest(id: string, status: string, reply?: string): Promise<void>;
  markInboxRead(): Promise<void>;
  openGraphCompose(graphId: string): Promise<void>;
  closeGraphCompose(): void;
  editGraphComposeMeta(patch: Partial<Pick<GraphComposeState, 'name' | 'description' | 'visibility' | 'showAdvancedJson' | 'editorMode' | 'selectedNodeId' | 'trialTask'>>): void;
  editGraphComposeSpec(patch: Partial<GraphSpec> | GraphSpec): void;
  addGraphStep(kind: GraphNode['kind']): void;
  patchGraphStep(id: string, patch: Partial<GraphNode>): void;
  removeGraphStep(id: string): void;
  moveGraphStep(index: number, delta: number): void;
  connectGraphEdge(from: string, to: string): void;
  disconnectGraphEdge(from: string, to: string): void;
  setGraphNodePosition(id: string, x: number, y: number): void;
  saveGraphCompose(): Promise<void>;
  publishGraphCompose(): Promise<void>;
  trialGraphCompose(): Promise<void>;
  rollbackGraphCompose(toVersion: number): Promise<void>;
}

export function useApp(clientOverride?: Client): { state: AppState; act: Actions } {
  const clientRef = useRef<Client | null>(null);
  if (!clientRef.current) clientRef.current = clientOverride ?? createClient({ baseUrl: API_BASE });
  const client = clientRef.current;

  const [state, setState] = useState<AppState>(initial);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ingestPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const run = state.graphCompose?.trialRun;
    if (!run || (run.status !== 'awaiting_approval' && run.status !== 'running')) return;
    let cancelled = false;
    let inflight = false;
    const tick = async () => {
      if (inflight || cancelled) return;
      inflight = true;
      try {
        const r = await client.getGraphRun(run.id);
        if (cancelled) return;
        setState((prev) => {
          if (!prev.graphCompose || prev.graphCompose.trialRun?.id !== run.id) return prev;
          return { ...prev, graphCompose: { ...prev.graphCompose, trialRun: r.run } };
        });
      } catch {
        /* keep last log */
      } finally {
        inflight = false;
      }
    };
    const id = window.setInterval(() => void tick(), 2000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [client, state.graphCompose?.trialRun?.id, state.graphCompose?.trialRun?.status]);

  const hasPendingMyApprovals = state.myApprovals.some((a) => a.status === 'pending');

  useEffect(() => {
    if (!state.me || state.route !== 'admin' || !isFullAdmin(state.me)) return;
    let cancelled = false;
    let inflight = false;
    const tick = async () => {
      if (inflight || cancelled) return;
      inflight = true;
      try {
        const [pending, stats] = await Promise.all([
          client.admin.pendingApprovals(),
          client.admin.statsUsage().catch(() => null),
        ]);
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          approvals: pending.approvals || [],
          ...(stats ? { stats } : {}),
        }));
      } catch {
        /* keep last */
      } finally {
        inflight = false;
      }
    };
    const id = window.setInterval(() => void tick(), 3000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [client, state.me, state.route]);

  useEffect(() => {
    if (!state.me) return;
    let cancelled = false;
    let inflight = false;
    const tick = async () => {
      if (inflight || cancelled) return;
      inflight = true;
      try {
        const r = await client.myApprovals();
        if (cancelled) return;
        setState((prev) => ({ ...prev, myApprovals: r.approvals || [] }));
      } catch {
        /* keep last */
      } finally {
        inflight = false;
      }
    };
    const id = window.setInterval(() => void tick(), hasPendingMyApprovals ? 3000 : 12000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [client, state.me, hasPendingMyApprovals]);

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
      const [agentsRes, graphsRes, sessionsRes, schedRes, approvalRes, tasksRes, skillsRes, notesRes, quotaRes, favRes] = await Promise.all([
        client.listAgents(),
        client.listGraphs().catch(() => ({ graphs: [] as AppState['graphs'] })),
        client.listSessions().catch(() => ({ sessions: [] as AppState['mySessions'] })),
        client.listScheduled().catch(() => ({ tasks: [] as AppState['schedTasks'] })),
        client.myApprovals().catch(() => ({ approvals: [] as AppState['myApprovals'] })),
        client.listTasks().catch(() => ({ tasks: [] as TaskView[] })),
        client.listSkills().catch(() => ({ skills: [] as AppState['skills'] })),
        client.listNotifications().catch(() => ({ notifications: [] as AppState['inbox'], unread: 0 })),
        client.myQuota().catch(() => null),
        client.listFavorites().catch(() => ({ ids: [] as string[] })),
      ]);
      const agents = agentsRes.agents || [];
      const graphs = graphsRes.graphs || [];
      const mySessions = (sessionsRes.sessions || []).filter((s) => s.status !== 'closed');
      const tasks = tasksRes.tasks || [];
      setState((prev) => ({
        ...prev,
        agents,
        graphs,
        mySessions,
        sessionTitles: buildSessionTitles(mySessions, agents, tasks),
        schedTasks: schedRes.tasks || [],
        myApprovals: approvalRes.approvals || [],
        skills: skillsRes.skills || [],
        inbox: notesRes.notifications || [],
        inboxUnread: notesRes.unread || 0,
        quota: quotaRes,
        favorites: favRes.ids || [],
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
      client.admin.kbDocuments().then((r) => setState((prev) => ({ ...prev, kbDocuments: r.documents || [] }))).catch(recordError('kb')),
      client.admin.kbStatus().then((r) => setState((prev) => ({ ...prev, kbStatus: r }))).catch(recordError('kb')),
      client.admin.kbAudit().then((r) => setState((prev) => ({ ...prev, kbAudit: r.events || [] }))).catch(recordError('kb')),
      client.admin.connectors().then((r) => setState((prev) => ({ ...prev, connectors: r.connectors || [] }))).catch(recordError('catalog')),
      client.admin.tools().then((r) => setState((prev) => ({ ...prev, catalogTools: r.tools || [] }))).catch(recordError('catalog')),
      client.admin.graphs().then((r) => setState((prev) => ({ ...prev, allGraphs: r.graphs || [] }))).catch(recordError('catalog')),
      fetchAudit({
        limit: '50',
        ...(state.auditUser ? { userId: state.auditUser } : {}),
        ...(state.auditSession ? { sessionId: state.auditSession } : {}),
        ...(state.auditType ? { eventType: state.auditType } : {}),
      }),
    ];
    await Promise.allSettled(jobs);
  }

  async function loadKbAdminData() {
    await Promise.allSettled([
      client.admin.kbDocuments().then((r) => setState((prev) => ({ ...prev, kbDocuments: r.documents || [] }))).catch(recordError('kb')),
      client.admin.kbStatus().then((r) => setState((prev) => ({ ...prev, kbStatus: r }))).catch(recordError('kb')),
      client.admin.kbAudit().then((r) => setState((prev) => ({ ...prev, kbAudit: r.events || [] }))).catch(recordError('kb')),
    ]);
  }

  function stopIngestPoll() {
    if (ingestPollRef.current) {
      clearInterval(ingestPollRef.current);
      ingestPollRef.current = null;
    }
  }

  function startIngestPoll() {
    stopIngestPoll();
    ingestPollRef.current = setInterval(() => {
      void client.admin.kbStatus().then(async (status) => {
        setState((prev) => ({ ...prev, kbStatus: status }));
        if (!status.ingestRunning) {
          stopIngestPoll();
          await reloadKb();
          notify(status.ingestError ? '索引重建失败' : '索引重建完成', !!status.ingestError);
        }
      }).catch(() => undefined);
    }, 2000);
  }

  async function login() {
    update({ loading: true });
    try {
      await client.devLogin(state.loginUser);
      const me = await client.me();
      const parsed = parseLocation(location.hash, me);
      update({ me, route: parsed.route, adminPane: parsed.adminPane, showDevLogin: false });
      await loadStore();
      if (parsed.skillId) await openSkill(parsed.skillId);
      if (isFullAdmin(me)) await loadAdminData();
      else if (canKbManage(me)) await loadKbAdminData();
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

  function patchChat(agentId: string, patch: Partial<NonNullable<AppState['chat']>>) {
    setState((prev) => {
      if (!prev.chat || prev.chat.agentId !== agentId) return prev;
      return { ...prev, chat: { ...prev.chat, ...patch } };
    });
  }

  function appendChatMessages(agentId: string, extra: ChatMessage[]) {
    setState((prev) => {
      if (!prev.chat || prev.chat.agentId !== agentId) return prev;
      return { ...prev, chat: { ...prev.chat, messages: [...prev.chat.messages, ...extra] } };
    });
  }

  async function loadChatHistory(agentId: string, sessionId: string | null) {
    try {
      let since: string | undefined;
      if (sessionId) {
        const sessions = await client.listSessions();
        since = (sessions.sessions || []).find((s) => s.id === sessionId)?.createdAt;
      }
      const r = await client.listTasks();
      const messages = tasksToMessages(r.tasks || [], agentId, since);
      patchChat(agentId, { messages, historyLoading: false });
      if (sessionId && since) {
        setState((prev) => {
          const agentName = prev.agents.find((a) => a.id === agentId)?.name ?? agentId;
          return {
            ...prev,
            sessionTitles: {
              ...prev.sessionTitles,
              [sessionId]: formatSessionTitle(agentName, r.tasks || [], agentId, since),
            },
          };
        });
      }
    } catch {
      patchChat(agentId, { historyLoading: false });
    }
  }

  async function openChat(sessionId: string, agentId: string) {
    setState((prev) => ({
      ...prev,
      route: 'chat',
      chat: { sessionId, agentId, error: null, messages: [], historyLoading: true },
    }));
    history.replaceState(null, '', '#chat');
    await loadChatHistory(agentId, sessionId);
  }

  function closeChat() {
    setState((prev) => ({ ...prev, route: 'store', chat: null }));
    history.replaceState(null, '', '#store');
  }

  async function startChat(agentId: string) {
    const existing = state.mySessions.find((s) => s.agentPresetId === agentId && s.status !== 'closed');
    if (existing) {
      await openChat(existing.id, agentId);
      return;
    }
    setState((prev) => ({ ...prev, agentBusy: { ...prev.agentBusy, [agentId]: true } }));
    try {
      const r = await client.createSession(agentId);
      await loadStore();
      await openChat(r.sessionId, agentId);
    } catch {
      setState((prev) => ({
        ...prev,
        route: 'chat',
        chat: { sessionId: null, agentId, error: '实例还没起来，请稍后重试', messages: [] },
      }));
      history.replaceState(null, '', '#chat');
    }
    setState((prev) => ({ ...prev, agentBusy: { ...prev.agentBusy, [agentId]: false } }));
  }

  async function deleteSession(sessionId: string) {
    const wasCurrent = state.chat?.sessionId === sessionId;
    try {
      await client.closeSession(sessionId);
      await loadStore();
      if (wasCurrent) closeChat();
      notify('对话已删除');
    } catch (e) {
      notify('删除失败：' + (e as Error).message, true);
    }
  }

  async function sendMessage(agentId: string, text: string): Promise<void> {
    const sessionId = state.chat?.sessionId;
    const isFirstQuestion = !(state.chat?.messages ?? []).some((m) => m.role === 'user');
    appendChatMessages(agentId, [{ role: 'user', text }]);
    if (sessionId && isFirstQuestion) {
      const agentName = state.agents.find((a) => a.id === agentId)?.name ?? agentId;
      const hint = extractQuestionHint(text);
      if (hint) {
        setState((prev) => ({
          ...prev,
          sessionTitles: { ...prev.sessionTitles, [sessionId]: `${agentName} · ${hint}` },
        }));
      }
    }
    runAbort.current?.abort();
    const ac = new AbortController();
    runAbort.current = ac;
    patchChat(agentId, { sending: true, runningTaskId: undefined });
    const agent = state.agents.find((a) => a.id === agentId);
    if (agent?.knowledge) {
      void client.searchKb(text, 5).then((r) => {
        patchChat(agentId, { citations: r.hits || [] });
      }).catch(() => undefined);
    }
    try {
      const r = await client.submitTask(agentId, text, sessionId ?? undefined);
      patchChat(agentId, { runningTaskId: r.taskId });
      if (r.awaitingApproval) {
        appendChatMessages(agentId, [{ role: 'assistant', text: '已提交，等待审批通过后执行。' }]);
      }
      const outcome = await waitForTaskResult((id) => client.getTask(id), r.taskId, {
        maxAttempts: r.awaitingApproval ? 180 : 40,
        intervalMs: 1500,
        signal: ac.signal,
      });
      switch (outcome.kind) {
        case 'done':
          appendChatMessages(agentId, [{ role: 'assistant', text: outcome.text }]);
          patchChat(agentId, {
            citations: mergeCitations(
              state.chat?.citations ?? [],
              extractCitations(outcome.text),
            ),
          });
          break;
        case 'failed':
          appendChatMessages(agentId, [{ role: 'assistant', text: outcome.text }]);
          break;
        case 'cancelled':
          appendChatMessages(agentId, [{ role: 'assistant', text: '已停止这一轮。' }]);
          break;
        case 'timeout':
          appendChatMessages(agentId, [{
            role: 'assistant',
            text: r.awaitingApproval
              ? '仍在等待审批或执行。刷新对话或稍后再看结果。'
              : '仍在执行。刷新对话或稍后再看结果。',
          }]);
          break;
        default: {
          const _never: never = outcome;
          return _never;
        }
      }
      if (r.awaitingApproval) await loadMyApprovals().catch(() => undefined);
      void client.myQuota().then((quota) => setState((prev) => ({ ...prev, quota }))).catch(() => undefined);
    } catch (e) {
      const message = (e as Error).message;
      // 限额等未真正发出的提问：从 transcript 撤回，改为 toast，避免留下「我 / 执行中」残影。
      if (isQuotaError(message)) {
        setState((prev) => {
          if (!prev.chat || prev.chat.agentId !== agentId) return prev;
          const messages = [...prev.chat.messages];
          const last = messages[messages.length - 1];
          if (last?.role === 'user' && last.text === text) messages.pop();
          return { ...prev, chat: { ...prev.chat, messages } };
        });
        notify(message, true);
      } else {
        appendChatMessages(agentId, [{ role: 'assistant', text: message }]);
      }
    } finally {
      if (runAbort.current === ac) runAbort.current = null;
      patchChat(agentId, { sending: false, runningTaskId: undefined });
    }
  }

  async function cancelRun(): Promise<void> {
    const chat = state.chat;
    const taskId = chat?.runningTaskId;
    runAbort.current?.abort();
    if (!taskId) {
      if (chat) patchChat(chat.agentId, { sending: false, runningTaskId: undefined });
      return;
    }
    try {
      await client.cancelTask(taskId);
      notify('已请求停止');
    } catch (e) {
      notify('停止失败：' + (e as Error).message, true);
    }
  }

  async function toggleFavorite(agentId: string): Promise<void> {
    try {
      const on = state.favorites.includes(agentId);
      const r = on ? await client.removeFavorite(agentId) : await client.addFavorite(agentId);
      setState((prev) => ({ ...prev, favorites: r.ids || [] }));
    } catch (e) {
      notify('收藏失败：' + (e as Error).message, true);
    }
  }

  async function loadEmployeeKb(): Promise<void> {
    try {
      const r = await client.listKbDocuments();
      setState((prev) => ({ ...prev, employeeKbDocs: r.documents || [] }));
    } catch (e) {
      notify('加载知识库失败：' + (e as Error).message, true);
    }
  }

  async function searchEmployeeKb(query?: string): Promise<void> {
    const q = (query ?? state.employeeKbQuery).trim();
    if (!q) {
      setState((prev) => ({ ...prev, employeeKbHits: [], employeeKbMode: '' }));
      return;
    }
    try {
      const r = await client.searchKb(q, 8);
      setState((prev) => ({
        ...prev,
        employeeKbQuery: q,
        employeeKbHits: r.hits || [],
        employeeKbMode: r.mode || '',
      }));
    } catch (e) {
      notify('检索失败：' + (e as Error).message, true);
    }
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
      const [pending] = await Promise.all([
        client.admin.pendingApprovals(),
        loadAdminData(),
        loadStore(),
      ]);
      setState((prev) => ({ ...prev, approvals: pending.approvals || [] }));
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

  async function loadMyApprovals() {
    try {
      const r = await client.myApprovals();
      setState((prev) => ({ ...prev, myApprovals: r.approvals || [] }));
    } catch (e) { notify('加载审批失败：' + (e as Error).message, true); }
  }

  async function cancelApproval(id: string) {
    try {
      await client.cancelApproval(id);
      notify('已撤销');
      await loadMyApprovals();
    } catch (e) { notify('撤销失败：' + (e as Error).message, true); }
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

  async function setAgentChain(id: string, roles: string[]) {
    try {
      await client.admin.setApprovalChain(id, roles);
      notify('已保存审批链');
      await loadAdminData();
    } catch (e) { notify('保存审批链失败：' + (e as Error).message, true); }
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

  async function reloadKb() {
    const [docs, status, audit] = await Promise.all([
      client.admin.kbDocuments(),
      client.admin.kbStatus(),
      client.admin.kbAudit(),
    ]);
    setState((prev) => ({
      ...prev,
      kbDocuments: docs.documents || [],
      kbStatus: status,
      kbAudit: audit.events || [],
    }));
  }

  async function doUploadKb(file: File) {
    const me = state.me;
    const contentBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(',')[1] ?? '');
      };
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsDataURL(file);
    });
    const departments = isFullAdmin(me) ? ['*'] : me?.dept ? [me.dept] : ['*'];
    await client.admin.uploadKbDocument(file.name, contentBase64, {
      classification: state.kbUploadClass,
      departments,
      roles: [],
    });
    await reloadKb();
    notify('已上传：' + file.name);
  }

  async function uploadKb(file: File) {
    const err = validateKbFile(file);
    if (err) {
      notify(err, true);
      return;
    }
    if (state.kbDocuments.some((d) => d.name === file.name)) {
      setState((prev) => ({ ...prev, kbPendingUpload: file }));
      return;
    }
    try {
      await doUploadKb(file);
    } catch (e) {
      notify('上传失败：' + (e as Error).message, true);
    }
  }

  async function confirmKbUpload() {
    const file = state.kbPendingUpload;
    if (!file) return;
    setState((prev) => ({ ...prev, kbPendingUpload: null }));
    try {
      await doUploadKb(file);
    } catch (e) {
      notify('上传失败：' + (e as Error).message, true);
    }
  }

  async function deleteKb(name: string) {
    try {
      await client.admin.deleteKbDocument(name);
      await reloadKb();
      notify('已删除：' + name);
    } catch (e) { notify('删除失败：' + (e as Error).message, true); }
  }

  async function saveKbVisibility(name: string, visibility: KbVisibility) {
    try {
      await client.admin.patchKbVisibility(name, visibility);
      await reloadKb();
      notify('已更新权限：' + name);
    } catch (e) { notify('权限更新失败：' + (e as Error).message, true); }
  }

  async function triggerKbIngest() {
    try {
      await client.admin.triggerKbIngest();
      notify('已开始重建索引…');
      const status = await client.admin.kbStatus();
      setState((prev) => ({ ...prev, kbStatus: status }));
      startIngestPoll();
    } catch (e) { notify('索引任务失败：' + (e as Error).message, true); }
  }

  async function runKbSearch() {
    try {
      const user = state.kbSearchDept.trim()
        ? { departments: [state.kbSearchDept.trim()], roles: state.kbSearchRole.trim() ? [state.kbSearchRole.trim()] : [] }
        : undefined;
      const r = await client.admin.kbSearch({ query: state.kbSearchQuery, limit: 5, user });
      setState((prev) => ({ ...prev, kbSearchHits: r.hits || [], kbSearchMode: r.mode || '' }));
    } catch (e) { notify('试搜失败：' + (e as Error).message, true); }
  }

  async function runGraph(id: string) {
    const task = state.graphTask[id] || '';
    if (!task.trim()) { notify('请填写任务内容', true); return; }
    setState((prev) => ({ ...prev, graphBusy: { ...prev.graphBusy, [id]: true } }));
    try {
      const r = await client.runGraph(id, task);
      setState((prev) => ({ ...prev, lastGraphRun: r.run, graphBusy: { ...prev.graphBusy, [id]: false } }));
      notify(r.run.status === 'done' ? '组合产品已跑完' : `状态：${r.run.status}`);
    } catch (e) {
      setState((prev) => ({ ...prev, graphBusy: { ...prev.graphBusy, [id]: false } }));
      notify('运行失败：' + (e as Error).message, true);
    }
  }

  async function reloadCatalog() {
    const [c, t, g] = await Promise.all([
      client.admin.connectors(),
      client.admin.tools(),
      client.admin.graphs(),
    ]);
    setState((prev) => ({ ...prev, connectors: c.connectors || [], catalogTools: t.tools || [], allGraphs: g.graphs || [] }));
  }

  async function saveConnector() {
    const f = state.connForm;
    if (!f.id || !f.secretRef) { notify('需要 id 与 secretRef', true); return; }
    try {
      const body = f.kind === 'postgres'
        ? { name: f.name, kind: 'postgres', secretRef: f.secretRef, postgres: { allowedTables: f.tables.split(',').map((s) => s.trim()).filter(Boolean), maxRows: 50 } }
        : { name: f.name, kind: 'http', secretRef: f.secretRef, http: { baseUrl: f.baseUrl, allowedMethods: ['GET', 'POST'] } };
      await client.admin.putConnector(f.id, body);
      await reloadCatalog();
      notify('已保存连接器');
    } catch (e) { notify((e as Error).message, true); }
  }

  async function publishConnector(id: string) {
    try {
      await client.admin.publishConnector(id);
      await reloadCatalog();
      notify('已发布连接器');
    } catch (e) { notify((e as Error).message, true); }
  }

  async function saveTool() {
    const f = state.toolForm;
    const conn = state.connectors.find((c) => c.id === f.connectorId);
    if (!f.id || !conn) { notify('需要工具 id 与连接器', true); return; }
    try {
      const binding = conn.kind === 'postgres'
        ? { kind: 'postgres', mode: 'query_readonly' }
        : { kind: 'http', method: 'GET', pathTemplate: f.path };
      await client.admin.putTool(f.id, { connectorId: f.connectorId, name: f.name, description: '', risk: 'read', binding });
      await reloadCatalog();
      notify('已保存工具');
    } catch (e) { notify((e as Error).message, true); }
  }

  async function publishTool(id: string) {
    try {
      await client.admin.publishTool(id);
      await reloadCatalog();
      notify('已发布工具');
    } catch (e) { notify((e as Error).message, true); }
  }

  async function saveGraphProduct() {
    const f = state.graphForm;
    if (!f.id || !f.name) { notify('需要图 id 与名称', true); return; }
    try {
      const seed: GraphSpec = { onError: 'stop', nodes: [], edges: [] };
      await client.admin.putGraph(f.id, { name: f.name, description: '', spec: seed });
      update({ graphForm: { id: '', name: '' } });
      await reloadCatalog();
      await openGraphCompose(f.id);
      notify('已创建图草稿，进入编排');
    } catch (e) { notify((e as Error).message, true); }
  }

  async function publishGraphProduct(id: string) {
    try {
      await client.admin.publishGraph(id);
      await reloadCatalog();
      await loadStore();
      if (state.graphCompose?.graphId === id) await openGraphCompose(id);
      notify('已上架组合产品');
    } catch (e) { notify((e as Error).message, true); }
  }

  async function unpublishGraphProduct(id: string) {
    try {
      await client.admin.unpublishGraph(id);
      await reloadCatalog();
      await loadStore();
      if (state.graphCompose?.graphId === id) await openGraphCompose(id);
      notify('已下架');
    } catch (e) { notify((e as Error).message, true); }
  }

  async function openGraphCompose(graphId: string) {
    try {
      const [gRes, toolsRes, agentsRes, revRes, runRes] = await Promise.all([
        client.admin.getGraph(graphId),
        client.admin.tools(),
        client.admin.allAgents(),
        client.admin.graphRevisions(graphId).catch(() => ({ revisions: [] })),
        client.admin.latestGraphRun(graphId).catch(() => ({ run: null })),
      ]);
      const g = gRes.graph;
      const spec = g.spec ?? { onError: 'stop' as const, nodes: [], edges: [] };
      setState((prev) => ({
        ...prev,
        graphCompose: {
          graphId: g.id,
          name: g.name,
          description: g.description ?? '',
          visibility: g.visibility ?? {},
          spec,
          version: g.version ?? 0,
          status: g.status ?? 'draft',
          dirty: false,
          showAdvancedJson: false,
          editorMode: prev.graphCompose?.graphId === graphId ? prev.graphCompose.editorMode : 'canvas',
          selectedNodeId: null,
          agents: agentsRes.agents || [],
          tools: toolsRes.tools || [],
          revisions: revRes.revisions || [],
          trialTask: prev.graphCompose?.graphId === graphId ? prev.graphCompose.trialTask : '',
          trialRun: runRes.run ?? (prev.graphCompose?.graphId === graphId ? prev.graphCompose.trialRun : null),
          trialBusy: false,
          saving: false,
          publishing: false,
        },
      }));
    } catch (e) {
      notify('打开图编排失败：' + (e as Error).message, true);
    }
  }

  function closeGraphCompose() {
    setState((prev) => ({ ...prev, graphCompose: null }));
  }

  function editGraphComposeMeta(patch: Partial<Pick<GraphComposeState, 'name' | 'description' | 'visibility' | 'showAdvancedJson' | 'editorMode' | 'selectedNodeId' | 'trialTask'>>) {
    setState((prev) => {
      if (!prev.graphCompose) return prev;
      const cosmetic = Object.keys(patch).every((k) =>
        k === 'trialTask' || k === 'editorMode' || k === 'selectedNodeId' || k === 'showAdvancedJson',
      );
      return { ...prev, graphCompose: { ...prev.graphCompose, ...patch, dirty: cosmetic ? prev.graphCompose.dirty : true } };
    });
  }

  function editGraphComposeSpec(patch: Partial<GraphSpec> | GraphSpec) {
    setState((prev) => {
      if (!prev.graphCompose) return prev;
      const full = patch as GraphSpec;
      const isFull = Array.isArray(full.nodes) && Array.isArray(full.edges) && (full.onError === 'stop' || full.onError === 'continue')
        && Object.keys(full).every((k) => k === 'nodes' || k === 'edges' || k === 'onError');
      const spec = isFull ? full : { ...prev.graphCompose.spec, ...patch };
      return { ...prev, graphCompose: { ...prev.graphCompose, spec, dirty: true } };
    });
  }

  function setGraphNodes(nodes: GraphNode[], opts?: { linearize?: boolean }) {
    setState((prev) => {
      if (!prev.graphCompose) return prev;
      const ids = new Set(nodes.map((n) => n.id));
      const edges = opts?.linearize
        ? linearEdges(nodes)
        : prev.graphCompose.spec.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
      return {
        ...prev,
        graphCompose: {
          ...prev.graphCompose,
          dirty: true,
          selectedNodeId: prev.graphCompose.selectedNodeId && ids.has(prev.graphCompose.selectedNodeId)
            ? prev.graphCompose.selectedNodeId
            : null,
          spec: { ...prev.graphCompose.spec, nodes, edges },
        },
      };
    });
  }

  function addGraphStep(kind: GraphNode['kind']) {
    const c = state.graphCompose;
    if (!c) return;
    const id = newStepId(c.spec.nodes);
    const node: GraphNode = kind === 'agent'
      ? { id, kind, agentPresetId: c.agents.find((a) => a.status === 'published')?.id, promptTemplate: '{{input.task}}' }
      : kind === 'tool'
        ? { id, kind, toolId: c.tools.find((t) => t.status === 'published')?.id, argsTemplate: {} }
        : { id, kind, when: 'true' };
    setGraphNodes([...c.spec.nodes, node]);
  }

  function patchGraphStep(id: string, patch: Partial<GraphNode>) {
    const c = state.graphCompose;
    if (!c) return;
    setGraphNodes(c.spec.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  function removeGraphStep(id: string) {
    const c = state.graphCompose;
    if (!c) return;
    setState((prev) => {
      if (!prev.graphCompose) return prev;
      const nodes = prev.graphCompose.spec.nodes.filter((n) => n.id !== id);
      return {
        ...prev,
        graphCompose: {
          ...prev.graphCompose,
          dirty: true,
          selectedNodeId: prev.graphCompose.selectedNodeId === id ? null : prev.graphCompose.selectedNodeId,
          spec: {
            ...prev.graphCompose.spec,
            nodes,
            edges: dropEdgesTouching(prev.graphCompose.spec.edges, id),
          },
        },
      };
    });
  }

  function moveGraphStep(index: number, delta: number) {
    const c = state.graphCompose;
    if (!c) return;
    const to = index + delta;
    if (to < 0 || to >= c.spec.nodes.length) return;
    const nodes = [...c.spec.nodes];
    const [row] = nodes.splice(index, 1);
    nodes.splice(to, 0, row);
    setGraphNodes(nodes, { linearize: true });
  }

  function connectGraphEdge(from: string, to: string) {
    const c = state.graphCompose;
    if (!c) return;
    if (c.spec.edges.some((e) => e.from === from && e.to === to)) return;
    if (wouldCreateCycle(c.spec, from, to)) {
      notify('不能形成环：图必须是 DAG', true);
      return;
    }
    setState((prev) => {
      if (!prev.graphCompose) return prev;
      return {
        ...prev,
        graphCompose: {
          ...prev.graphCompose,
          dirty: true,
          spec: { ...prev.graphCompose.spec, edges: [...prev.graphCompose.spec.edges, { from, to }] },
        },
      };
    });
  }

  function disconnectGraphEdge(from: string, to: string) {
    setState((prev) => {
      if (!prev.graphCompose) return prev;
      return {
        ...prev,
        graphCompose: {
          ...prev.graphCompose,
          dirty: true,
          spec: {
            ...prev.graphCompose.spec,
            edges: prev.graphCompose.spec.edges.filter((e) => !(e.from === from && e.to === to)),
          },
        },
      };
    });
  }

  function setGraphNodePosition(id: string, x: number, y: number) {
    setState((prev) => {
      if (!prev.graphCompose) return prev;
      return {
        ...prev,
        graphCompose: {
          ...prev.graphCompose,
          dirty: true,
          spec: {
            ...prev.graphCompose.spec,
            nodes: prev.graphCompose.spec.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
          },
        },
      };
    });
  }

  async function saveGraphCompose() {
    const c = state.graphCompose;
    if (!c) return;
    setState((prev) => prev.graphCompose ? { ...prev, graphCompose: { ...prev.graphCompose, saving: true } } : prev);
    try {
      await client.admin.putGraph(c.graphId, {
        name: c.name,
        description: c.description,
        visibility: c.visibility,
        spec: c.spec,
      });
      await openGraphCompose(c.graphId);
      await reloadCatalog();
      notify('已保存图草稿');
    } catch (e) {
      notify('保存失败：' + (e as Error).message, true);
      setState((prev) => prev.graphCompose ? { ...prev, graphCompose: { ...prev.graphCompose, saving: false } } : prev);
    }
  }

  async function publishGraphCompose() {
    const c = state.graphCompose;
    if (!c) return;
    setState((prev) => prev.graphCompose ? { ...prev, graphCompose: { ...prev.graphCompose, publishing: true } } : prev);
    try {
      if (c.dirty) {
        await client.admin.putGraph(c.graphId, {
          name: c.name,
          description: c.description,
          visibility: c.visibility,
          spec: c.spec,
        });
      }
      await client.admin.publishGraph(c.graphId);
      await openGraphCompose(c.graphId);
      await reloadCatalog();
      await loadStore();
      notify('已上架组合产品');
    } catch (e) {
      notify('发布失败：' + (e as Error).message, true);
      setState((prev) => prev.graphCompose ? { ...prev, graphCompose: { ...prev.graphCompose, publishing: false } } : prev);
    }
  }

  async function trialGraphCompose() {
    const c = state.graphCompose;
    if (!c) return;
    setState((prev) => prev.graphCompose ? { ...prev, graphCompose: { ...prev.graphCompose, trialBusy: true } } : prev);
    try {
      if (c.dirty) {
        await client.admin.putGraph(c.graphId, {
          name: c.name,
          description: c.description,
          visibility: c.visibility,
          spec: c.spec,
        });
      }
      const r = await client.admin.trialGraph(c.graphId, c.trialTask || '');
      setState((prev) => prev.graphCompose
        ? { ...prev, graphCompose: { ...prev.graphCompose, trialRun: r.run, trialBusy: false, dirty: false } }
        : prev);
      notify(r.run.status === 'done' ? '试跑完成' : `试跑状态：${r.run.status}`);
    } catch (e) {
      setState((prev) => prev.graphCompose ? { ...prev, graphCompose: { ...prev.graphCompose, trialBusy: false } } : prev);
      notify('试跑失败：' + (e as Error).message, true);
    }
  }

  async function rollbackGraphCompose(toVersion: number) {
    const c = state.graphCompose;
    if (!c) return;
    try {
      const r = await client.admin.rollbackGraph(c.graphId, toVersion);
      await openGraphCompose(c.graphId);
      await reloadCatalog();
      await loadStore();
      notify(r.notice);
    } catch (e) {
      notify('回滚失败：' + (e as Error).message, true);
    }
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
        const parsed = parseLocation(ssoToken ? '' : location.hash, me);
        setState((prev) => ({ ...prev, me, route: parsed.route, adminPane: parsed.adminPane }));
        await loadStore();
        if (parsed.skillId) await openSkill(parsed.skillId);
        if (isFullAdmin(me)) await loadAdminData();
        else if (canKbManage(me)) await loadKbAdminData();
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

  useEffect(() => () => stopIngestPoll(), []);

  async function openSkill(id: string) {
    try {
      const [detail, vers, crs] = await Promise.all([
        client.getSkill(id),
        client.listSkillVersions(id).catch(() => ({ versions: [] })),
        client.listChangeRequests(id).catch(() => ({ changeRequests: [] })),
      ]);
      const s = detail.skill;
      setState((prev) => ({
        ...prev,
        skillDetail: s,
        skillVersions: vers.versions || [],
        skillRequests: crs.changeRequests || [],
        skillCreating: false,
        skillForm: {
          slug: s.slug,
          title: s.title,
          description: s.description,
          body: s.draftBody ?? '',
          version: s.draftVersion ?? '0.1.0',
          visibility: s.visibility ?? 'company',
          tags: (s.tags ?? []).join(', '),
        },
        crDraft: null,
        route: 'skills',
      }));
      history.replaceState(null, '', '#skills/' + id);
    } catch (e) {
      notify('加载 skill 失败：' + (e as Error).message, true);
    }
  }

  function closeSkill() {
    setState((prev) => ({ ...prev, skillDetail: null, skillCreating: false, crDraft: null }));
    history.replaceState(null, '', '#skills');
  }

  async function createSkill() {
    const f = state.skillForm;
    if (!f.slug.trim() || !f.title.trim()) {
      notify('需要 slug 与标题', true);
      return;
    }
    try {
      const r = await client.createSkill({
        slug: f.slug.trim(),
        title: f.title.trim(),
        description: f.description,
        body: f.body,
        version: f.version || '0.1.0',
        visibility: f.visibility,
        tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      notify(r.notice);
      await loadStore();
      await openSkill(r.skill.id);
    } catch (e) {
      notify('创建失败：' + (e as Error).message, true);
    }
  }

  async function saveSkill() {
    const id = state.skillDetail?.id;
    if (!id) return;
    const f = state.skillForm;
    try {
      const r = await client.patchSkill(id, {
        title: f.title,
        description: f.description,
        body: f.body,
        version: f.version,
        ...(canSkillManage(state.me) ? { visibility: f.visibility } : {}),
        tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      notify(r.notice);
      await openSkill(id);
      await loadStore();
    } catch (e) {
      notify('保存失败：' + (e as Error).message, true);
    }
  }

  async function submitSkill() {
    const id = state.skillDetail?.id;
    if (!id) return;
    try {
      const r = await client.submitSkill(id);
      notify(r.notice);
      await openSkill(id);
      await loadStore();
    } catch (e) {
      notify('提交失败：' + (e as Error).message, true);
    }
  }

  async function archiveSkill() {
    const id = state.skillDetail?.id;
    if (!id) return;
    try {
      const r = await client.archiveSkill(id);
      notify(r.notice);
      await loadStore();
      closeSkill();
    } catch (e) {
      notify('下架失败：' + (e as Error).message, true);
    }
  }

  async function voteSkill(kind: 'like' | 'dislike') {
    const id = state.skillDetail?.id;
    if (!id) return;
    try {
      await client.skillFeedback(id, kind);
      await openSkill(id);
      await loadStore();
    } catch (e) {
      notify('投票失败：' + (e as Error).message, true);
    }
  }

  async function reviewSkill(vid: string, decision: 'approve' | 'reject', comment?: string) {
    const id = state.skillDetail?.id;
    if (!id) return;
    try {
      const r = await client.reviewSkill(id, vid, { decision, comment });
      notify(r.notice);
      await openSkill(id);
      await loadStore();
    } catch (e) {
      notify('审核失败：' + (e as Error).message, true);
    }
  }

  async function addSkillVersion() {
    const id = state.skillDetail?.id;
    if (!id) return;
    const f = state.skillForm;
    try {
      const r = await client.addSkillVersion(id, { version: f.version, body: f.body });
      notify(r.notice);
      await openSkill(id);
      await loadStore();
    } catch (e) {
      notify('新版本失败：' + (e as Error).message, true);
    }
  }

  function startChangeRequest(lineNo: number, originalText: string) {
    setState((prev) => ({ ...prev, crDraft: { lineNo, originalText, suggested: originalText, reason: '' } }));
  }

  async function submitChangeRequest() {
    const id = state.skillDetail?.id;
    const d = state.crDraft;
    if (!id || !d) return;
    try {
      const r = await client.addChangeRequest(id, {
        lineNo: d.lineNo,
        originalText: d.originalText,
        suggestedText: d.suggested,
        reason: d.reason,
      });
      notify(r.notice);
      setState((prev) => ({ ...prev, crDraft: null }));
      await openSkill(id);
    } catch (e) {
      notify('建议失败：' + (e as Error).message, true);
    }
  }

  async function handleChangeRequest(id: string, status: string, reply?: string) {
    try {
      await client.handleChangeRequest(id, { status, reply });
      notify('已处理工单');
      if (state.skillDetail) await openSkill(state.skillDetail.id);
    } catch (e) {
      notify('处理失败：' + (e as Error).message, true);
    }
  }

  async function markInboxRead() {
    try {
      const r = await client.readNotifications();
      setState((prev) => ({ ...prev, inbox: r.notifications, inboxUnread: r.unread }));
    } catch (e) {
      notify('标记已读失败：' + (e as Error).message, true);
    }
  }

  const act: Actions = {
    update, notify, login, logout, loadStore, loadAdminData, loadKbAdminData, startChat, openChat, closeChat, deleteSession, sendMessage, cancelRun, toggleFavorite, searchEmployeeKb, loadEmployeeKb, propose,
    decide, toggleAgent, createAgent, removeAgent, setQuota, resolveQuotaAlert, loadScheduled, setSchedForm, createScheduled, runScheduled, setScheduledStatus, removeScheduled, loadSchedRuns, loadMyApprovals, cancelApproval, setRoleForm, upsertRole, removeRole, setAgentChain, focusUser, editUser, saveUser, setStatus,
    loadSessions, clearSessionFilter, openSession, stopInstance, reapIdle,
    saveOverlay, clearOverlay, loadAudit,
    uploadKb, confirmKbUpload, deleteKb, saveKbVisibility, triggerKbIngest, runKbSearch,
    openCompose, closeCompose, editComposeSpec, refreshComposePreview, saveComposeSpec, publishCompose, rollbackCompose,
    runGraph, saveConnector, publishConnector, saveTool, publishTool, saveGraphProduct, publishGraphProduct, unpublishGraphProduct,
    openGraphCompose, closeGraphCompose, editGraphComposeMeta, editGraphComposeSpec, addGraphStep, patchGraphStep, removeGraphStep, moveGraphStep,
    connectGraphEdge, disconnectGraphEdge, setGraphNodePosition,
    saveGraphCompose, publishGraphCompose, trialGraphCompose, rollbackGraphCompose,
    openSkill, closeSkill, createSkill, saveSkill, submitSkill, archiveSkill, voteSkill, reviewSkill, addSkillVersion,
    startChangeRequest, submitChangeRequest, handleChangeRequest, markInboxRead,
  };

  return { state, act };
}

export function parseLocation(hash: string, me: Me | null): { route: Route; adminPane: AdminPane; skillId?: string } {
  const h = hash.replace(/^#/, '');
  const kbOk = canKbManage(me);
  const fullAdmin = isFullAdmin(me);
  if (h === 'chat' || h.startsWith('chat/')) return { route: 'chat', adminPane: 'workbench' };
  if (h === 'chats' || h.startsWith('chats/')) return { route: 'chats', adminPane: 'workbench' };
  if (h === 'approvals' || h.startsWith('approvals/')) return { route: 'approvals', adminPane: 'workbench' };
  if (h === 'kb' || h === 'knowledge') return { route: 'kb', adminPane: 'workbench' };
  if (h === 'skills' || h.startsWith('skills/')) {
    const skillId = h.startsWith('skills/') ? h.slice('skills/'.length).split('/')[0] : undefined;
    return { route: 'skills', adminPane: 'workbench', skillId: skillId || undefined };
  }
  if (h.startsWith('admin')) {
    if (!kbOk) return { route: 'store', adminPane: 'workbench' };
    if (!fullAdmin) return { route: 'admin', adminPane: 'kb' };
    const adminPane: AdminPane =
      h === 'admin/config' ? 'config'
        : h === 'admin/kb' ? 'kb'
          : h === 'admin/investigate' ? 'investigate'
            : 'workbench';
    return { route: 'admin', adminPane };
  }
  return { route: 'store', adminPane: 'workbench' };
}
