import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { Client } from './store-client';

function fakeClient(overrides: Partial<Client> = {}): Client {
  return {
    token: '',
    setToken: vi.fn(),
    clearToken: vi.fn(),
    devLogin: vi.fn(async () => ({ accessToken: 't' })),
    me: vi.fn(async () => ({ id: 'u-admin', name: '管理员', role: 'admin', dept: 'IT' })),
    listAgents: vi.fn(async () => ({ agents: [] })),
    listSessions: vi.fn(async () => ({ sessions: [] })),
    createSession: vi.fn(async () => ({ sessionId: 's1', routingSecret: 'secret-should-stay-hidden' })),
    getSession: vi.fn(async () => ({ id: 's1', status: 'active', agentPresetId: 'assistant' })),
    submitTask: vi.fn(async () => ({ taskId: 't1', status: 'queued', awaitingApproval: false })),
    getTask: vi.fn(async () => ({
      task: { id: 't1', status: 'done', payload: { task: '你好' }, result: { finalResponse: '好的' } },
    })),
    proposeAgent: vi.fn(async () => ({ agent: { id: 'x', name: 'x', description: '' }, notice: 'ok' })),
    capabilities: vi.fn(async () => ({ models: [], mcpServers: [], hostPlane: [] })),
    getSpec: vi.fn(async () => ({ spec: { id: 'x', name: 'x', description: '', visibility: {}, approvalLevel: 'none' as const, modelRoute: { provider: 'p', model: 'm', pinned: false }, persona: '', mcp: [] as string[] }, version: 1, dirty: false })),
    putSpec: vi.fn(async () => ({ notice: 'ok' })),
    previewSpec: vi.fn(async () => ({ validation: { ok: true }, yaml: '' })),
    publishSpec: vi.fn(async () => ({ agent: { id: 'x', name: 'x', description: '' }, version: 2, notice: 'ok' })),
    listRevisions: vi.fn(async () => ({ revisions: [] })),
    rollback: vi.fn(async () => ({ agent: { id: 'x', name: 'x', description: '' }, version: 3, notice: 'ok' })),
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
      users: vi.fn(async () => ({ users: [] })),
      patchUser: vi.fn(async () => undefined),
      sessions: vi.fn(async () => ({ sessions: [] })),
      session: vi.fn(async () => ({ session: { id: 's', userId: 'u', agentPresetId: 'a', status: 'open', createdAt: '' }, events: [] })),
      instances: vi.fn(async () => ({ count: 0, instances: [] })),
      stopInstance: vi.fn(async () => undefined),
      reapIdle: vi.fn(async () => ({ reaped: [] })),
      permissions: vi.fn(async () => ({ deptOverlays: {} })),
      setOverlay: vi.fn(async () => undefined),
      models: vi.fn(async () => ({ defaultModel: 'm', gateway: { deployed: false }, agents: [] })),
      auditEvents: vi.fn(async () => ({ events: [] })),
    },
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
  await waitFor(() => expect(screen.getByText('助手商店')).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByText('助手商店')).toBeInTheDocument());
    expect(client.devLogin).toHaveBeenCalledWith('u-admin');
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
    await user.click(screen.getByRole('button', { name: '开始对话' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '返回商店' })).toBeInTheDocument());
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
    await user.click(screen.getByRole('button', { name: '开始对话' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '返回商店' })).toBeInTheDocument());
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
    await user.click(screen.getByRole('button', { name: '开始对话' }));
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
    await waitFor(() => expect(screen.getByRole('button', { name: '返回商店' })).toBeInTheDocument());
    expect(client.createSession).not.toHaveBeenCalled();
  });

  it('keeps propose behind a secondary control', async () => {
    const client = fakeClient({ listAgents: vi.fn(async () => ({ agents: [assistant] })) });
    await loginAs(client);
    expect(screen.queryByPlaceholderText(/id（如/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '申请新助手' })).toBeInTheDocument();
  });

  it('splits admin into workbench, config, and investigate', async () => {
    const user = await loginAs(fakeClient());
    await user.click(screen.getByRole('link', { name: '管理' }));
    expect(screen.getByRole('tab', { name: '工作台' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '配置' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '调查' })).toBeInTheDocument();
    expect(screen.getByText('待审批')).toBeInTheDocument();
    expect(screen.queryByText('审计查询')).not.toBeInTheDocument();
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
    expect(screen.queryByText('待审批')).not.toBeInTheDocument();
  });
});
