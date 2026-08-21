import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    createSession: vi.fn(async () => ({ sessionId: 's1', routingSecret: 'r' })),
    proposeAgent: vi.fn(async () => ({ agent: { id: 'x', name: 'x', description: '' }, notice: 'ok' })),
    admin: {
      pendingApprovals: vi.fn(async () => ({ approvals: [] })),
      decideApproval: vi.fn(async () => undefined),
      statsUsage: vi.fn(async () => ({ stats: { totals: { tasks: 0, failed: 0, pendingApprovals: 0 }, tasksByAgent: [], recentErrors: [] } })),
      quotaPolicies: vi.fn(async () => ({ policies: [] })),
      setQuotaPolicy: vi.fn(async () => undefined),
      allAgents: vi.fn(async () => ({ agents: [] })),
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

describe('App', () => {
  it('renders the login view when there is no stored token', () => {
    render(<App client={fakeClient()} />);
    expect(screen.getByRole('button', { name: '登录（dev）' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/用户 id/)).toBeInTheDocument();
  });

  it('logs in and shows the store', async () => {
    const user = userEvent.setup();
    const client = fakeClient();
    render(<App client={client} />);
    await user.clear(screen.getByPlaceholderText(/用户 id/));
    await user.type(screen.getByPlaceholderText(/用户 id/), 'u-admin');
    await user.click(screen.getByRole('button', { name: '登录（dev）' }));
    await waitFor(() => expect(screen.getByText('Agent 商店')).toBeInTheDocument());
    expect(client.devLogin).toHaveBeenCalledWith('u-admin');
  });

  it('restores a stored session and shows agents for a non-admin', async () => {
    const client = fakeClient({
      token: 'tok',
      me: vi.fn(async () => ({ id: 'u-dev-1', name: '开发', role: 'developer', dept: '研发' })),
      listAgents: vi.fn(async () => ({ agents: [{ id: 'assistant', name: '通用助手', description: '底座', modelRoute: { model: 'deepseek-v4-flash' }, approvalLevel: 'none' }] })),
    });
    render(<App client={client} />);
    await waitFor(() => expect(screen.getByText('通用助手')).toBeInTheDocument());
  });
});
