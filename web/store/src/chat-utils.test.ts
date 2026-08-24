import { describe, it, expect } from 'vitest';
import { buildSessionTitles, extractQuestionHint, formatSessionTitle, resolveSessionTitle, tasksToMessages, waitForTaskResult } from './chat-utils';
import type { TaskView } from './types';

describe('waitForTaskResult', () => {
  it('keeps polling through queued (awaiting approval) until done', async () => {
    const statuses = ['queued', 'queued', 'running', 'done'] as const;
    let i = 0;
    const sleeps: number[] = [];
    const result = await waitForTaskResult(
      async () => {
        const status = statuses[Math.min(i, statuses.length - 1)]!;
        i += 1;
        return {
          task: {
            id: 't1',
            status,
            result: status === 'done' ? { finalResponse: '批准后回复' } : undefined,
          },
        };
      },
      't1',
      { intervalMs: 10, sleep: async (ms) => { sleeps.push(ms); } },
    );
    expect(result).toEqual({ kind: 'done', text: '批准后回复' });
    expect(i).toBe(4);
    expect(sleeps.length).toBe(3);
  });

  it('returns failed when the task fails after approval', async () => {
    const result = await waitForTaskResult(
      async () => ({ task: { id: 't1', status: 'failed', error: '拒绝执行' } }),
      't1',
      { sleep: async () => undefined },
    );
    expect(result).toEqual({ kind: 'failed', text: '拒绝执行' });
  });
});

describe('tasksToMessages', () => {
  it('reconstructs user/assistant pairs from done tasks for one agent', () => {
    const tasks: TaskView[] = [
      {
        id: 't2',
        agentPresetId: 'assistant',
        status: 'done',
        payload: { task: '第二个问题' },
        result: { finalResponse: '第二个回答' },
        createdAt: '2026-08-21T00:01:00Z',
      },
      {
        id: 't1',
        agentPresetId: 'assistant',
        status: 'done',
        payload: { task: '第一个问题' },
        result: { finalResponse: '第一个回答' },
        createdAt: '2026-08-21T00:00:00Z',
      },
      {
        id: 't-other',
        agentPresetId: 'hr-assistant',
        status: 'done',
        payload: { task: '人事问题' },
        result: { finalResponse: '人事回答' },
        createdAt: '2026-08-21T00:00:00Z',
      },
    ];
    const messages = tasksToMessages(tasks, 'assistant');
    expect(messages).toEqual([
      { role: 'user', text: '第一个问题' },
      { role: 'assistant', text: '第一个回答' },
      { role: 'user', text: '第二个问题' },
      { role: 'assistant', text: '第二个回答' },
    ]);
  });

  it('hides unsent queued and quota-failed tasks from history', () => {
    const messages = tasksToMessages([
      {
        id: 't-quota-queued',
        agentPresetId: 'assistant',
        status: 'queued',
        payload: { task: '北京市出差一天补助多少钱？' },
        createdAt: '2026-08-21T00:00:00Z',
      },
      {
        id: 't-quota-failed',
        agentPresetId: 'assistant',
        status: 'failed',
        payload: { task: '北京市出差一天补助多少钱？' },
        error: '配额已用尽：20/20（day）',
        createdAt: '2026-08-21T00:00:01Z',
      },
      {
        id: 't-ok',
        agentPresetId: 'assistant',
        status: 'done',
        payload: { task: '北京市出差一天补助多少钱？' },
        result: { finalResponse: '知识库未找到具体金额' },
        createdAt: '2026-08-21T00:00:02Z',
      },
    ], 'assistant');
    expect(messages).toEqual([
      { role: 'user', text: '北京市出差一天补助多少钱？' },
      { role: 'assistant', text: '知识库未找到具体金额' },
    ]);
  });

  it('shows a placeholder when done tasks have empty finalResponse', () => {
    const messages = tasksToMessages([
      {
        id: 't-empty',
        agentPresetId: 'assistant',
        status: 'done',
        payload: { task: '全员，落地速度，经营分析' },
        result: { finalResponse: '', finishReason: 'error' },
        createdAt: '2026-08-21T00:00:00Z',
      },
    ], 'assistant');
    expect(messages).toEqual([
      { role: 'user', text: '全员，落地速度，经营分析' },
      { role: 'assistant', text: '（无回复）' },
    ]);
  });

  it('shows failed task errors in the transcript', () => {
    const messages = tasksToMessages([
      {
        id: 't-fail',
        agentPresetId: 'assistant',
        status: 'failed',
        payload: { task: '下一轮' },
        error: 'Authentication Fails',
        createdAt: '2026-08-21T00:00:00Z',
      },
    ], 'assistant');
    expect(messages).toEqual([
      { role: 'user', text: '下一轮' },
      { role: 'assistant', text: 'Authentication Fails' },
    ]);
  });

  it('filters tasks to those after the session started', () => {
    const messages = tasksToMessages([
      {
        id: 't-old',
        agentPresetId: 'assistant',
        status: 'done',
        payload: { task: '旧问题' },
        result: { finalResponse: '旧回答' },
        createdAt: '2026-08-20T00:00:00Z',
      },
      {
        id: 't-new',
        agentPresetId: 'assistant',
        status: 'done',
        payload: { task: '新问题' },
        result: { finalResponse: '新回答' },
        createdAt: '2026-08-21T00:00:00Z',
      },
    ], 'assistant', '2026-08-21T00:00:00Z');
    expect(messages).toEqual([
      { role: 'user', text: '新问题' },
      { role: 'assistant', text: '新回答' },
    ]);
  });
});

describe('session titles', () => {
  it('strips polite prefixes and builds agent · hint titles', () => {
    expect(extractQuestionHint('请问公司的年假制度是什么？')).toBe('公司的年假制度是什么');
    expect(formatSessionTitle('通用助手', [{
      id: 't1',
      agentPresetId: 'assistant',
      status: 'done',
      payload: { task: '帮我查一下考勤异常怎么处理' },
      createdAt: '2026-08-21T00:00:00Z',
    }], 'assistant', '2026-08-21T00:00:00Z')).toBe('通用助手 · 查一下考勤异常怎么处理');
  });

  it('falls back to agent name when there are no questions yet', () => {
    expect(formatSessionTitle('通用助手', [], 'assistant')).toBe('通用助手');
    expect(resolveSessionTitle('通用助手', 's1', {}, [])).toBe('通用助手');
  });

  it('builds a title map for each open session', () => {
    const titles = buildSessionTitles(
      [{ id: 's1', userId: 'u', agentPresetId: 'assistant', status: 'active', createdAt: '2026-08-21T00:00:00Z' }],
      [{ id: 'assistant', name: '通用助手', description: '' }],
      [{
        id: 't1',
        agentPresetId: 'assistant',
        status: 'done',
        payload: { task: '办公用品怎么申领' },
        createdAt: '2026-08-21T00:01:00Z',
      }],
    );
    expect(titles.s1).toBe('通用助手 · 办公用品怎么申领');
  });

  it('handles tasks without payload safely', () => {
    expect(formatSessionTitle('通用助手', [{ id: 't1', status: 'done' } as TaskView], 'assistant')).toBe('通用助手');
    expect(tasksToMessages([{ id: 't1', agentPresetId: 'assistant', status: 'done' } as TaskView], 'assistant')).toEqual([]);
  });
});
