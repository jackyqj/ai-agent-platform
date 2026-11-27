import { describe, it, expect } from 'vitest';
import { buildChatTimeline, liveStripText } from './chat-timeline';

describe('buildChatTimeline', () => {
  it('keeps user and assistant bubbles', () => {
    expect(buildChatTimeline({
      messages: [
        { role: 'user', text: '画一张图' },
        { role: 'assistant', text: '可以。' },
      ],
    })).toEqual([
      { kind: 'user', text: '画一张图' },
      { kind: 'assistant', text: '可以。' },
    ]);
  });

  it('turns a sending turn into an in-thread status step', () => {
    expect(buildChatTimeline({
      messages: [{ role: 'user', text: '你好' }],
      sending: true,
    })).toEqual([
      { kind: 'user', text: '你好' },
      { kind: 'status', phase: 'running', label: '正在处理' },
    ]);
  });

  it('shows queued while the task is still waiting in line', () => {
    expect(buildChatTimeline({
      messages: [{ role: 'user', text: '你好' }],
      sending: true,
      runPhase: 'queued',
    })).toEqual([
      { kind: 'user', text: '你好' },
      { kind: 'status', phase: 'queued', label: '排队中' },
    ]);
  });

  it('hides pending placeholders and shows an approval card instead', () => {
    expect(buildChatTimeline({
      messages: [
        { role: 'user', text: '查库' },
        { role: 'assistant', text: '已提交，等待审批通过后执行。' },
        { role: 'assistant', text: '（执行中…）', pending: true },
      ],
      sending: true,
      awaitingApproval: true,
      pendingApprovals: [{ id: 'ap1', requesterUserId: 'u', action: 'query_readonly', level: 'manager', status: 'pending' }],
    })).toEqual([
      { kind: 'user', text: '查库' },
      { kind: 'approval', approvalId: 'ap1', action: 'query_readonly', level: 'manager', status: 'pending' },
    ]);
  });

  it('shows waiting status when approval is pending but the card has not arrived', () => {
    expect(buildChatTimeline({
      messages: [{ role: 'user', text: '查库' }],
      sending: true,
      awaitingApproval: true,
      pendingApprovals: [],
    })).toEqual([
      { kind: 'user', text: '查库' },
      { kind: 'status', phase: 'queued', label: '等待审批' },
    ]);
  });

  it('puts a hanging inquiry in the thread instead of a running step', () => {
    expect(buildChatTimeline({
      messages: [{ role: 'user', text: '画架构' }],
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
    })).toEqual([
      { kind: 'user', text: '画架构' },
      {
        kind: 'inquiry',
        requestId: 'rq1',
        questionId: 'direction',
        prompt: '画哪一层？',
        options: [{ id: '控制面', label: '控制面' }, { id: '商店', label: '商店' }],
        multiSelect: undefined,
        detail: undefined,
      },
    ]);
  });
});

describe('liveStripText', () => {
  it('prefers retry, then inquiry, approval, queue, then running', () => {
    expect(liveStripText({ error: '实例还没起来' })).toBe('待重试');
    expect(liveStripText({ sending: true, inquiry: true })).toBe('等待你选择方向');
    expect(liveStripText({ sending: true, awaitingApproval: true })).toBe('等待审批');
    expect(liveStripText({ sending: true, pendingCount: 1 })).toBe('等待审批');
    expect(liveStripText({ sending: true, runPhase: 'queued' })).toBe('排队中');
    expect(liveStripText({ sending: true })).toBe('正在处理');
    expect(liveStripText({})).toBe('就绪');
  });
});
