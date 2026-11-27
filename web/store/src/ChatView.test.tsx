import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatView from './ChatView';
import type { Actions } from './useApp';
import type { AppState, ChatState } from './types';

function stateWithChat(chat: ChatState, extra: Partial<AppState> = {}): AppState {
  return {
    me: { id: 'u', name: '我', role: 'employee', dept: '人事' },
    route: 'chat',
    agents: [{ id: 'assistant', name: '通用助手', description: '问日常问题' }],
    chat,
    myApprovals: [],
    mySessions: [],
    sessionTitles: {},
    ...extra,
  } as AppState;
}

const act = {
  closeChat: vi.fn(),
  deleteSession: vi.fn(),
  sendMessage: vi.fn(async () => undefined),
  answerInquiry: vi.fn(async () => undefined),
  cancelRun: vi.fn(async () => undefined),
  cancelApproval: vi.fn(async () => undefined),
  startChat: vi.fn(),
  openChat: vi.fn(),
} as unknown as Actions;

describe('ChatView', () => {
  it('uses a textarea composer and shows live status while sending', () => {
    render(<ChatView act={act} state={stateWithChat({
      sessionId: 's1',
      agentId: 'assistant',
      error: null,
      sending: true,
      messages: [{ role: 'user', text: '你好' }],
    })} />);
    expect(screen.getByPlaceholderText('跟森米说点什么…').tagName).toBe('TEXTAREA');
    expect(screen.getByRole('status')).toHaveTextContent('正在处理');
    expect(screen.getByLabelText('本回合步骤')).toHaveTextContent('正在处理');
    expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument();
    expect(screen.queryByText('运行中')).not.toBeInTheDocument();
  });

  it('puts a pending approval in the transcript, not the rail', async () => {
    const user = userEvent.setup();
    render(<ChatView act={act} state={stateWithChat({
      sessionId: 's1',
      agentId: 'assistant',
      error: null,
      sending: true,
      awaitingApproval: true,
      messages: [{ role: 'user', text: '查库' }],
    }, {
      myApprovals: [{ id: 'ap1', requesterUserId: 'u', action: 'query_readonly', level: 'manager', status: 'pending' }],
    })} />);
    expect(screen.getByRole('status')).toHaveTextContent('等待审批');
    const gate = screen.getByLabelText('审批闸门');
    expect(gate).toHaveTextContent('query_readonly');
    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(act.cancelApproval).toHaveBeenCalledWith('ap1');
  });

  it('keeps an idle live strip and an inquiry card in the transcript', async () => {
    const user = userEvent.setup();
    render(<ChatView act={act} state={stateWithChat({
      sessionId: 's1',
      agentId: 'assistant',
      error: null,
      sending: true,
      runPhase: 'running',
      inquiry: {
        requestId: 'rq1',
        questions: [{
          id: 'direction',
          prompt: '画哪一层？',
          options: [{ id: '控制面', label: '控制面' }, { id: '商店', label: '商店' }],
        }],
      },
      messages: [{ role: 'user', text: '画架构' }],
    })} />);
    expect(screen.getByRole('status')).toHaveTextContent('等待你选择方向');
    await user.click(screen.getByRole('button', { name: '控制面' }));
    await user.click(screen.getByRole('button', { name: '提交' }));
    expect(act.answerInquiry).toHaveBeenCalledWith({
      answers: [{ id: 'direction', selected: ['控制面'] }],
    });
  });

  it('sends on Enter and keeps Shift+Enter in the draft', async () => {
    const user = userEvent.setup();
    render(<ChatView act={act} state={stateWithChat({
      sessionId: 's1',
      agentId: 'assistant',
      error: null,
      messages: [],
    })} />);
    expect(screen.getByRole('status')).toHaveTextContent('就绪');
    const box = screen.getByPlaceholderText('跟森米说点什么…');
    await user.type(box, '第一行{Shift>}{Enter}{/Shift}第二行');
    expect(box).toHaveValue('第一行\n第二行');
    await user.type(box, '{Enter}');
    expect(act.sendMessage).toHaveBeenCalledWith('assistant', '第一行\n第二行');
  });
});
