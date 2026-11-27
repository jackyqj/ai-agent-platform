import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { Client } from './store-client';
import type { SkillItem } from './types';

function stubSkill(status: SkillItem['status'] = 'draft'): SkillItem {
  return { id: 'sk1', slug: 's', title: 's', description: '', status, likeCount: 0, dislikeCount: 0, score: 0, stars: 0 };
}

function fakeClient(overrides: Partial<Client> = {}): Client {
  return {
    token: '',
    setToken: vi.fn(),
    clearToken: vi.fn(),
    devLogin: vi.fn(async () => ({ accessToken: 't' })),
    me: vi.fn(async () => ({ id: 'u-admin', name: '管理员', role: 'admin', dept: 'IT' })),
    listAgents: vi.fn(async () => ({ agents: [] })),
    listAgentScenes: vi.fn(async () => ({ scenes: [] })),
    myQuota: vi.fn(async () => ({ unlimited: true, used: 0, budget: 0, remaining: 0, period: 'day' })),
    listFavorites: vi.fn(async () => ({ ids: [] })),
    addFavorite: vi.fn(async () => ({ ids: [] })),
    removeFavorite: vi.fn(async () => ({ ids: [] })),
    cancelTask: vi.fn(async () => ({ task: { id: 't1', status: 'killed' }, notice: 'ok' })),
    listKbDocuments: vi.fn(async () => ({ documents: [] })),
    searchKb: vi.fn(async () => ({ hits: [], mode: 'none' })),
    listGraphs: vi.fn(async () => ({ graphs: [] })),
    runGraph: vi.fn(async () => ({ run: { id: 'r1', graphId: 'g', status: 'done', steps: [] } })),
    listSessions: vi.fn(async () => ({ sessions: [] })),
    createSession: vi.fn(async () => ({ sessionId: 's1', routingSecret: 'secret-should-stay-hidden' })),
    getSession: vi.fn(async () => ({ id: 's1', status: 'active', agentPresetId: 'assistant' })),
    closeSession: vi.fn(async () => ({ ok: true })),
    listTasks: vi.fn(async () => ({ tasks: [] })),
    submitTask: vi.fn(async () => ({ taskId: 't1', status: 'queued', awaitingApproval: false })),
    getTask: vi.fn(async () => ({
      task: { id: 't1', status: 'done', payload: { task: '你好' }, result: { finalResponse: '好的' } },
    })),
    answerTaskInquiry: vi.fn(async () => ({ task: { id: 't1', status: 'running' } })),
    proposeAgent: vi.fn(async () => ({ agent: { id: 'x', name: 'x', description: '' }, notice: 'ok' })),
    listScheduled: vi.fn(async () => ({ tasks: [] })),
    createScheduled: vi.fn(async () => ({ task: { id: 's', ownerUserId: 'u', name: 'n', agentPresetId: 'a', schedule: 'every 1m', taskTemplate: 't', status: 'active', createdAt: '' }, notice: 'ok' })),
    runScheduled: vi.fn(async () => ({ ok: true })),
    setScheduledStatus: vi.fn(async () => ({ task: { id: 's', ownerUserId: 'u', name: 'n', agentPresetId: 'a', schedule: 'every 1m', taskTemplate: 't', status: 'active', createdAt: '' }, notice: 'ok' })),
    removeScheduled: vi.fn(async () => ({ ok: true })),
    scheduleRuns: vi.fn(async () => ({ runs: [] })),
    myApprovals: vi.fn(async () => ({ approvals: [] })),
    cancelApproval: vi.fn(async () => ({ ok: true })),
    capabilities: vi.fn(async () => ({ models: [], mcpServers: [], hostPlane: [] })),
    getSpec: vi.fn(async () => ({ spec: { id: 'x', name: 'x', description: '', visibility: {}, approvalLevel: 'none' as const, modelRoute: { provider: 'p', model: 'm', pinned: false }, persona: '', mcp: [] as string[] }, version: 1, dirty: false })),
    putSpec: vi.fn(async () => ({ notice: 'ok' })),
    previewSpec: vi.fn(async () => ({ validation: { ok: true }, yaml: '' })),
    publishSpec: vi.fn(async () => ({ agent: { id: 'x', name: 'x', description: '' }, version: 2, notice: 'ok' })),
    listRevisions: vi.fn(async () => ({ revisions: [] })),
    rollback: vi.fn(async () => ({ agent: { id: 'x', name: 'x', description: '' }, version: 3, notice: 'ok' })),
    listSkills: vi.fn(async () => ({ skills: [] })),
    createSkill: vi.fn(async () => ({ skill: stubSkill('draft'), notice: 'ok' })),
    getSkill: vi.fn(async () => ({ skill: stubSkill('draft') })),
    patchSkill: vi.fn(async () => ({ skill: stubSkill('draft'), notice: 'ok' })),
    submitSkill: vi.fn(async () => ({ skill: stubSkill('pending'), notice: 'ok' })),
    archiveSkill: vi.fn(async () => ({ skill: stubSkill('archived'), notice: 'ok' })),
    listSkillVersions: vi.fn(async () => ({ versions: [] })),
    addSkillVersion: vi.fn(async () => ({ skill: stubSkill('pending'), notice: 'ok' })),
    reviewSkill: vi.fn(async () => ({ skill: stubSkill('published'), notice: 'ok' })),
    skillFeedback: vi.fn(async () => ({ skill: { ...stubSkill('published'), likeCount: 1, score: 0.2, stars: 1 } })),
    listChangeRequests: vi.fn(async () => ({ changeRequests: [] })),
    addChangeRequest: vi.fn(async () => ({ changeRequest: { id: 'cr', skillId: 'sk1', versionId: 'v', anchor: { line_no: 1, original_text: 'a' }, suggestedText: 'b', reason: '', requesterId: 'u', status: 'open' }, notice: 'ok' })),
    handleChangeRequest: vi.fn(async () => ({ changeRequest: { id: 'cr', skillId: 'sk1', versionId: 'v', anchor: { line_no: 1, original_text: 'a' }, suggestedText: 'b', reason: '', requesterId: 'u', status: 'adopted' } })),
    listNotifications: vi.fn(async () => ({ notifications: [], unread: 0 })),
    readNotifications: vi.fn(async () => ({ notifications: [], unread: 0 })),
    admin: {
      pendingApprovals: vi.fn(async () => ({ approvals: [] })),
      decideApproval: vi.fn(async () => undefined),
      statsUsage: vi.fn(async () => ({ stats: { totals: { tasks: 0, failed: 0, pendingApprovals: 0 }, tasksByAgent: [], recentErrors: [] } })),
      quotaPolicies: vi.fn(async () => ({ policies: [] })),
      setQuotaPolicy: vi.fn(async () => undefined),
      quotaAlerts: vi.fn(async () => ({ alerts: [] })),
      resolveQuotaAlert: vi.fn(async () => ({ ok: true, alerts: [] })),
      allAgents: vi.fn(async () => ({ agents: [] })),
      createAgent: vi.fn(async () => ({ agent: { id: 'x', name: 'x', description: '' }, notice: 'ok' })),
      removeAgent: vi.fn(async () => ({ notice: 'ok' })),
      publishAgent: vi.fn(async () => undefined),
      enableIm: vi.fn(async () => ({ binding: { presetId: 'x', enabled: true, keywords: [], priority: 0 }, notice: 'ok' })),
      disableIm: vi.fn(async () => ({ binding: { presetId: 'x', enabled: false, keywords: [], priority: 0 }, notice: 'ok' })),
      getIm: vi.fn(async () => ({ binding: null })),
      imBindings: vi.fn(async () => ({ bindings: [] })),
      imStatus: vi.fn(async () => ({ enabled: false, streamConnected: false, bindingsCount: 0, tracked: 0 })),
      users: vi.fn(async () => ({ users: [] })),
      patchUser: vi.fn(async () => undefined),
      sessions: vi.fn(async () => ({ sessions: [] })),
      session: vi.fn(async () => ({ session: { id: 's', userId: 'u', agentPresetId: 'a', status: 'open', createdAt: '' }, events: [] })),
      instances: vi.fn(async () => ({ count: 0, instances: [] })),
      stopInstance: vi.fn(async () => undefined),
      reapIdle: vi.fn(async () => ({ reaped: [] })),
      permissions: vi.fn(async () => ({ deptOverlays: {}, matrix: {}, rolePresets: {}, presets: ['read-only', 'workspace-write', 'danger-full-access'] })),
      setOverlay: vi.fn(async () => undefined),
      models: vi.fn(async () => ({ defaultModel: 'm', gateway: { deployed: false }, agents: [] })),
      auditEvents: vi.fn(async () => ({ events: [] })),
      allScheduled: vi.fn(async () => ({ tasks: [] })),
      scheduledRuns: vi.fn(async () => ({ runs: [] })),
      roles: vi.fn(async () => ({ roles: [] })),
      upsertRole: vi.fn(async () => ({ ok: true, roles: [] })),
      removeRole: vi.fn(async () => ({ ok: true, roles: [] })),
      setApprovalChain: vi.fn(async () => ({ roles: [] })),
      kbDocuments: vi.fn(async () => ({ documents: [] })),
      kbStatus: vi.fn(async () => ({ documentCount: 0, chunkCount: 0, ingestRunning: false })),
      uploadKbDocument: vi.fn(async () => ({ ok: true, document: { name: 't.md', format: 'md', sizeBytes: 1, updatedAt: '', visibility: { classification: 'internal' as const, departments: ['*'], roles: [] }, indexed: false, chunkCount: 0 } })),
      patchKbVisibility: vi.fn(async () => ({ ok: true, visibility: { classification: 'internal' as const, departments: ['*'], roles: [] } })),
      deleteKbDocument: vi.fn(async () => ({ ok: true })),
      triggerKbIngest: vi.fn(async () => ({ ok: true, startedAt: new Date().toISOString() })),
      kbSearch: vi.fn(async () => ({ hits: [], mode: 'none' })),
      kbAudit: vi.fn(async () => ({ events: [] })),
      connectors: vi.fn(async () => ({ connectors: [] })),
      putConnector: vi.fn(async () => ({ connector: { id: 'c', name: 'c', kind: 'http', status: 'draft', secretRef: 'X' } })),
      publishConnector: vi.fn(async () => ({ notice: 'ok' })),
      tools: vi.fn(async () => ({ tools: [] })),
      putTool: vi.fn(async () => ({ tool: { id: 't', connectorId: 'c', name: 't', status: 'draft', description: '' } })),
      publishTool: vi.fn(async () => ({ notice: 'ok' })),
      graphs: vi.fn(async () => ({ graphs: [] })),
      putGraph: vi.fn(async () => ({ graph: { id: 'g', name: 'g', description: '', status: 'draft', version: 0, spec: { onError: 'stop' as const, nodes: [], edges: [] } }, notice: 'ok' })),
      publishGraph: vi.fn(async () => ({ graph: { id: 'g', name: 'g', description: '' }, notice: 'ok' })),
      unpublishGraph: vi.fn(async () => ({ notice: 'ok' })),
      getGraph: vi.fn(async () => ({ graph: { id: 'g', name: 'g', description: '', status: 'draft', version: 0, spec: { onError: 'stop' as const, nodes: [], edges: [] } } })),
      graphRevisions: vi.fn(async () => ({ revisions: [] })),
      rollbackGraph: vi.fn(async () => ({ graph: { id: 'g', name: 'g', description: '' }, notice: 'ok' })),
      trialGraph: vi.fn(async () => ({ run: { id: 'r', graphId: 'g', status: 'done', steps: [] } })),
      latestGraphRun: vi.fn(async () => ({ run: null })),
    },
    getGraphRun: vi.fn(async () => ({ run: { id: 'r', graphId: 'g', status: 'done', steps: [] } })),
    ...overrides,
  };
}

const assistant = {
  id: 'assistant',
  name: '通用助手',
  description: '问日常问题',
  modelRoute: { model: 'deepseek-v4-flash' },
  approvalLevel: 'none',
};

async function expandDevLogin(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '本地开发登录' }));
}

async function loginAs(client: Client, user = userEvent.setup()) {
  render(<App client={client} />);
  await expandDevLogin(user);
  await user.click(screen.getByRole('button', { name: '登录' }));
  await waitFor(() => expect(screen.getByText('今天想让森米帮你做什么？')).toBeInTheDocument());
  return user;
}

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('shows DingTalk SSO as the primary login and hides the dev form', () => {
    render(<App client={fakeClient()} />);
    expect(screen.getByRole('link', { name: '使用钉钉登录' })).toHaveAttribute('href', '/api/auth/sso/login');
    expect(screen.queryByRole('button', { name: '登录' })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/用户 id/)).not.toBeInTheDocument();
  });

  it('applies an SSO token from the hash and opens the store', async () => {
    window.history.replaceState(null, '', '/#token=sso-tok');
    let tok = '';
    const client = fakeClient({
      me: vi.fn(async () => ({ id: 'u-hr-1', name: 'HR', role: 'employee', dept: '人事' })),
      listAgents: vi.fn(async () => ({ agents: [assistant] })),
    });
    Object.defineProperty(client, 'token', { get: () => tok });
    client.setToken = (t: string) => { tok = t; };
    render(<App client={client} />);
    await waitFor(() => expect(screen.getByText('通用助手')).toBeInTheDocument());
    expect(tok).toBe('sso-tok');
    expect(client.me).toHaveBeenCalled();
  });

  it('logs in via the folded dev form and shows the store', async () => {
    const user = userEvent.setup();
    const client = fakeClient();
    render(<App client={client} />);
    await expandDevLogin(user);
    await user.clear(screen.getByPlaceholderText(/用户 id/));
    await user.type(screen.getByPlaceholderText(/用户 id/), 'u-admin');
    await user.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(screen.getByText('今天想让森米帮你做什么？')).toBeInTheDocument());
    expect(client.devLogin).toHaveBeenCalledWith('u-admin');
  });

  it('shows published composite products for employees to run, not edit', async () => {
    const client = fakeClient({
      me: vi.fn(async () => ({ id: 'u-hr-1', name: 'HR', role: 'employee', dept: '人事' })),
      listGraphs: vi.fn(async () => ({ graphs: [{ id: 'invoice-pack', name: '发票摘要', description: '拉数再写' }] })),
    });
    await loginAs(client);
    expect(screen.getByRole('heading', { name: '组合产品' })).toBeInTheDocument();
    expect(screen.getByText('发票摘要')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '运行' })).toBeInTheDocument();
    expect(screen.queryByText('连接器 / 工具 / 组合图')).not.toBeInTheDocument();
  });

  it('restores a stored session and shows agents for a non-admin', async () => {
    const client = fakeClient({
      token: 'tok',
      me: vi.fn(async () => ({ id: 'u-dev-1', name: '开发', role: 'developer', dept: '研发' })),
      listAgents: vi.fn(async () => ({ agents: [assistant] })),
    });
    render(<App client={client} />);
    await waitFor(() => expect(screen.getByText('通用助手')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: '管理' })).not.toBeInTheDocument();
  });

  it('starts a conversation without showing the routing secret', async () => {
    const client = fakeClient({
      me: vi.fn(async () => ({ id: 'u-hr-1', name: 'HR', role: 'employee', dept: '人事' })),
      listAgents: vi.fn(async () => ({ agents: [assistant] })),
    });
    const user = await loginAs(client);
    await user.click(screen.getByRole('button', { name: '开始使用' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '回市集' })).toBeInTheDocument());
    expect(client.createSession).toHaveBeenCalledWith('assistant');
    expect(screen.getByRole('heading', { name: '通用助手' })).toBeInTheDocument();
    expect(screen.queryByText(/密钥/)).not.toBeInTheDocument();
    expect(screen.queryByText('secret-should-stay-hidden')).not.toBeInTheDocument();
    expect(screen.queryByText(/选用/)).not.toBeInTheDocument();
  });

  it('reuses an active session instead of creating another', async () => {
    const client = fakeClient({
      listAgents: vi.fn(async () => ({ agents: [assistant] })),
      listSessions: vi.fn(async () => ({
        sessions: [{ id: 'sess-open', userId: 'u-admin', agentPresetId: 'assistant', status: 'active', createdAt: '2026-08-21T00:00:00Z' }],
      })),
    });
    const user = await loginAs(client);
    await user.click(screen.getByRole('button', { name: '开始使用' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '回市集' })).toBeInTheDocument());
    expect(client.createSession).not.toHaveBeenCalled();
  });

  it('shows a retryable message when the instance fails to start', async () => {
    const client = fakeClient({
      listAgents: vi.fn(async () => ({ agents: [assistant] })),
      createSession: vi.fn(async () => {
        throw new Error('instance timeout');
      }),
    });
    const user = await loginAs(client);
    await user.click(screen.getByRole('button', { name: '开始使用' }));
    await waitFor(() => expect(screen.getByText(/实例还没起来，请稍后重试/)).toBeInTheDocument());
    expect(screen.queryByText(/密钥/)).not.toBeInTheDocument();
  });

  it('lists my conversations and continues an existing one', async () => {
    const client = fakeClient({
      listAgents: vi.fn(async () => ({ agents: [assistant] })),
      listSessions: vi.fn(async () => ({
        sessions: [{ id: 'sess-2', userId: 'u-admin', agentPresetId: 'assistant', status: 'active', createdAt: '2026-08-21T00:00:00Z' }],
      })),
    });
    const user = await loginAs(client);
    expect(screen.getByText('我的对话')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /继续.*通用助手/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: '回市集' })).toBeInTheDocument());
    expect(client.createSession).not.toHaveBeenCalled();
  });

  it('keeps propose off the market and on the approvals page', async () => {
    const client = fakeClient({ listAgents: vi.fn(async () => ({ agents: [assistant] })) });
    const user = await loginAs(client);
    expect(screen.queryByRole('button', { name: '申请新助手' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: '待审批' }));
    expect(screen.getByRole('button', { name: '申请新助手' })).toBeInTheDocument();
  });

  it('splits admin into workbench, config, knowledge, and investigate', async () => {
    const user = await loginAs(fakeClient());
    await user.click(screen.getByRole('link', { name: '管理' }));
    expect(screen.getByRole('tab', { name: '工作台' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '配置' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '知识库' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '调查' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '待审批' })).toBeInTheDocument();
    expect(screen.queryByText('审计查询')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '知识库' }));
    expect(screen.getByRole('heading', { name: '索引状态' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '文档' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '调查' }));
    expect(screen.getByText('审计')).toBeInTheDocument();
  });

  it('asks for confirmation before disabling a user', async () => {
    const client = fakeClient({
      admin: {
        ...fakeClient().admin,
        users: vi.fn(async () => ({
          users: [{ id: 'u-hr-1', name: 'HR', dept: '人事', role: 'employee', status: 'active' }],
        })),
      },
    });
    const user = await loginAs(client);
    await user.click(screen.getByRole('link', { name: '管理' }));
    await user.click(screen.getByRole('tab', { name: '调查' }));
    await user.click(screen.getByRole('button', { name: '禁用' }));
    expect(screen.getByText(/会立即回收该用户的实例/)).toBeInTheDocument();
    expect(client.admin.patchUser).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认禁用' }));
    await waitFor(() => expect(client.admin.patchUser).toHaveBeenCalledWith('u-hr-1', { status: 'disabled' }));
  });

  it('shows knowledge base nav for kb.manage custom role', async () => {
    const user = userEvent.setup();
    const client = fakeClient({
      me: vi.fn(async () => ({ id: 'u-hr-1', name: 'HR', role: 'kb-editor', dept: '人事', permissions: ['kb.manage'] })),
      listAgents: vi.fn(async () => ({ agents: [assistant] })),
    });
    render(<App client={client} />);
    await expandDevLogin(user);
    await user.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(screen.getByRole('link', { name: '知识库' })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: '管理' })).not.toBeInTheDocument();
  });

  it('loads chat history when continuing a conversation', async () => {
    const client = fakeClient({
      listAgents: vi.fn(async () => ({ agents: [assistant] })),
      listSessions: vi.fn(async () => ({
        sessions: [{ id: 'sess-2', userId: 'u-admin', agentPresetId: 'assistant', status: 'active', createdAt: '2026-08-21T00:00:00Z' }],
      })),
      listTasks: vi.fn(async () => ({
        tasks: [{
          id: 't-old',
          agentPresetId: 'assistant',
          status: 'done',
          payload: { task: '请问年假有多少天' },
          result: { finalResponse: '你好，有什么可以帮你？' },
          createdAt: '2026-08-21T00:00:00Z',
        }],
      })),
    });
    const user = await loginAs(client);
    expect(screen.getByText('通用助手 · 年假有多少天')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /继续.*通用助手 · 年假有多少天/ }));
    await waitFor(() => expect(screen.getByText('你好，有什么可以帮你？')).toBeInTheDocument());
    expect(client.listTasks).toHaveBeenCalled();
  });

  it('deletes a conversation from the sidebar', async () => {
    const client = fakeClient({
      listAgents: vi.fn(async () => ({ agents: [assistant] })),
      listSessions: vi.fn(async () => ({
        sessions: [{ id: 'sess-del', userId: 'u-admin', agentPresetId: 'assistant', status: 'active', createdAt: '2026-08-21T00:00:00Z' }],
      })),
    });
    const user = await loginAs(client);
    await user.click(screen.getByRole('button', { name: /删除.*通用助手/ }));
    await waitFor(() => expect(client.closeSession).toHaveBeenCalledWith('sess-del'));
  });

  it('shows session events beside the session table', async () => {
    const client = fakeClient({
      admin: {
        ...fakeClient().admin,
        sessions: vi.fn(async () => ({
          sessions: [{ id: 'sess-9', userId: 'u-hr-1', userName: 'HR', dept: '人事', agentPresetId: 'assistant', status: 'active', createdAt: '2026-08-21T00:00:00Z' }],
        })),
        session: vi.fn(async () => ({
          session: { id: 'sess-9', userId: 'u-hr-1', agentPresetId: 'assistant', status: 'active', createdAt: '2026-08-21T00:00:00Z' },
          events: [{ ts: '2026-08-21T00:00:01Z', eventType: 'session.create', payload: {} }],
        })),
      },
    });
    const user = await loginAs(client);
    await user.click(screen.getByRole('link', { name: '管理' }));
    await user.click(screen.getByRole('tab', { name: '调查' }));
    const table = screen.getByRole('table');
    await user.click(within(table).getByText('HR'));
    await waitFor(() => expect(screen.getByText(/session.create/)).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: '待审批' })).not.toBeInTheDocument();
  });

  it('opens the skill market from the nav', async () => {
    const client = fakeClient({
      listSkills: vi.fn(async () => ({
        skills: [{ id: 'sk1', slug: 'leave-faq', title: '请假 FAQ', description: '请假', status: 'published' as const, likeCount: 2, dislikeCount: 0, score: 0.4, stars: 2 }],
      })),
    });
    const user = await loginAs(client);
    await user.click(screen.getByRole('link', { name: '技能' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '技能' })).toBeInTheDocument());
    expect(screen.getByText('请假 FAQ')).toBeInTheDocument();
  });

  it('badges an agent whose bound skill has a newer published version', async () => {
    const client = fakeClient({
      listAgents: vi.fn(async () => ({
        agents: [{ ...assistant, skillUpdates: [{ skillId: 'sk1', boundVersion: '0.1.0', currentVersion: '0.2.0' }] }],
      })),
    });
    await loginAs(client);
    expect(screen.getByText('可更新')).toBeInTheDocument();
  });

  it('opens a skill from the hash on login', async () => {
    window.history.replaceState(null, '', '/#skills/sk1');
    const skill = { id: 'sk1', slug: 'leave-faq', title: '请假 FAQ', description: '请假', status: 'published' as const, likeCount: 2, dislikeCount: 0, score: 0.4, stars: 2 };
    const client = fakeClient({
      listSkills: vi.fn(async () => ({ skills: [skill] })),
      getSkill: vi.fn(async () => ({ skill })),
    });
    const user = userEvent.setup();
    render(<App client={client} />);
    await expandDevLogin(user);
    await user.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '请假 FAQ' })).toBeInTheDocument());
    expect(client.getSkill).toHaveBeenCalledWith('sk1');
  });

  it('filters the market by scene and opens agent detail', async () => {
    const client = fakeClient({
      listAgents: vi.fn(async () => ({
        agents: [
          { ...assistant, scene: 'general', tags: ['问答'], avatar: '✨' },
          { id: 'picture-book', name: '绘本解析', description: '拆绘本', scene: 'content', tags: ['绘本'], avatar: '📖', approvalLevel: 'none' },
        ],
      })),
    });
    const user = await loginAs(client);
    expect(screen.getByText('绘本解析')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '内容' }));
    expect(screen.getByText('绘本解析')).toBeInTheDocument();
    expect(screen.queryByText('通用助手')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '详情' }));
    const detail = screen.getByRole('dialog', { name: '绘本解析' });
    expect(detail).toBeInTheDocument();
    expect(within(detail).getByText('拆绘本')).toBeInTheDocument();
  });

  it('shows the employee quota bar when a budget exists', async () => {
    const client = fakeClient({
      listAgents: vi.fn(async () => ({ agents: [assistant] })),
      myQuota: vi.fn(async () => ({ unlimited: false, used: 3, budget: 20, remaining: 17, period: 'day' })),
    });
    await loginAs(client);
    expect(screen.getByLabelText('今日额度')).toBeInTheDocument();
    expect(screen.getByText(/3 \/ 20 次/)).toBeInTheDocument();
  });

  it('opens the conversations page from the nav', async () => {
    const client = fakeClient({
      listAgents: vi.fn(async () => ({ agents: [assistant] })),
      listSessions: vi.fn(async () => ({
        sessions: [{ id: 'sess-2', userId: 'u-admin', agentPresetId: 'assistant', status: 'active', createdAt: '2026-08-21T00:00:00Z' }],
      })),
    });
    const user = await loginAs(client);
    await user.click(screen.getByRole('link', { name: /对话/ }));
    expect(screen.getByRole('heading', { name: '我的对话' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '打开' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '回市集' })).toBeInTheDocument());
  });

  it('lets employees open the read-only knowledge view', async () => {
    const client = fakeClient({
      me: vi.fn(async () => ({ id: 'u-hr-1', name: 'HR', role: 'employee', dept: '人事' })),
      listAgents: vi.fn(async () => ({ agents: [assistant] })),
      listKbDocuments: vi.fn(async () => ({
        documents: [{ name: 'leave.md', format: 'md', sizeBytes: 12, updatedAt: '', visibility: { classification: 'internal' as const, departments: ['*'], roles: [] }, indexed: true, chunkCount: 3 }],
      })),
    });
    const user = await loginAs(client);
    await user.click(screen.getByRole('link', { name: '知识库' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '只读检索' })).toBeInTheDocument());
    expect(screen.getByText('leave.md')).toBeInTheDocument();
    expect(client.listKbDocuments).toHaveBeenCalled();
  });

  it('can stop an in-flight run', async () => {
    const client = fakeClient({
      listAgents: vi.fn(async () => ({ agents: [assistant] })),
      submitTask: vi.fn(async () => ({ taskId: 't-run', status: 'running', awaitingApproval: false })),
      getTask: vi.fn(async () => ({ task: { id: 't-run', status: 'running' } })),
    });
    const user = await loginAs(client);
    await user.click(screen.getByRole('button', { name: '开始使用' }));
    await waitFor(() => expect(screen.getByPlaceholderText('跟森米说点什么…')).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText('跟森米说点什么…'), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument());
    await waitFor(() => expect(client.submitTask).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: '停止' }));
    await waitFor(() => expect(client.cancelTask).toHaveBeenCalledWith('t-run'));
  });

  it('stars an agent as favorite', async () => {
    const client = fakeClient({
      listAgents: vi.fn(async () => ({ agents: [assistant] })),
      addFavorite: vi.fn(async () => ({ ids: ['assistant'] })),
    });
    const user = await loginAs(client);
    await user.click(screen.getByRole('button', { name: '收藏 通用助手' }));
    await waitFor(() => expect(client.addFavorite).toHaveBeenCalledWith('assistant'));
  });
});
