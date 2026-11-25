import type { Agent, ChatMessage, SessionRow, TaskView } from './types';

const QUESTION_PREFIXES = [
  /^请?(问|教|帮忙)?/,
  /^帮我/,
  /^我想(知道|了解|问)?/,
  /^能否/,
  /^可不可以/,
  /^可以(吗|否)?/,
  /^怎么(样|办|做|回事|查|看)?/,
  /^如何/,
  /^什么(是|意思)?/,
  /^为什么/,
  /^是否/,
  /^麻烦/,
  /^你好[,，]?/,
  /^嗨[,，]?/,
];

/** Pull a short topic hint from a user question for session titles. */
export function extractQuestionHint(text: string, maxLen = 16): string {
  let s = text.trim().replace(/\s+/g, ' ');
  if (!s) return '';

  s = s.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '').trim();
  if (!s) return '';

  for (const re of QUESTION_PREFIXES) {
    s = s.replace(re, '').trim();
  }

  s = s.replace(/^[，,、：:\s]+/, '');
  s = s.replace(/[？?。！!…\.]+$/g, '');
  const first = s.split(/[？?。！!\n]/)[0]?.trim() ?? s;
  s = first;
  if (!s) return '';

  if (s.length > maxLen) return s.slice(0, maxLen) + '…';
  return s;
}

/** Read user question text from a task record (payload shape may vary). */
export function taskQuestionText(task: TaskView | undefined): string {
  const payload = task?.payload;
  if (!payload) return '';
  if (typeof payload === 'string') return payload.trim();
  if (typeof payload === 'object' && payload !== null && 'task' in payload) {
    const taskText = (payload as { task?: unknown }).task;
    return typeof taskText === 'string' ? taskText.trim() : '';
  }
  return '';
}

/** Tasks that never left the queue (e.g. quota rejected after insert) or failed on quota. */
export function isUnsentTask(task: TaskView): boolean {
  if (task.status === 'queued') return true;
  if (task.status === 'failed' && /配额/.test(task.error ?? '')) return true;
  if (task.status === 'killed') return true;
  return false;
}

export function formatSessionTitle(agentName: string, tasks: TaskView[], agentPresetId: string, since?: string): string {
  const rows = tasks
    .filter((t): t is TaskView => !!t)
    .filter((t) => (t.agentPresetId ?? '') === agentPresetId)
    .filter((t) => !since || (t.createdAt ?? '') >= since)
    .filter((t) => !isUnsentTask(t))
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

  const hint = extractQuestionHint(taskQuestionText(rows[0]));
  if (!hint) return agentName;
  return `${agentName} · ${hint}`;
}

export function buildSessionTitles(sessions: SessionRow[], agents: Agent[], tasks: TaskView[]): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const s of sessions) {
    const agentName = agents.find((a) => a.id === s.agentPresetId)?.name ?? s.agentPresetId;
    titles[s.id] = formatSessionTitle(agentName, tasks, s.agentPresetId, s.createdAt);
  }
  return titles;
}

export function resolveSessionTitle(
  agentName: string,
  sessionId: string | null,
  sessionTitles: Record<string, string>,
  messages: ChatMessage[] = [],
): string {
  if (sessionId && sessionTitles[sessionId]) return sessionTitles[sessionId];
  const firstUser = messages.find((m) => m.role === 'user');
  if (firstUser) {
    const hint = extractQuestionHint(firstUser.text);
    if (hint) return `${agentName} · ${hint}`;
  }
  return agentName;
}

/** Reconstruct chat transcript from task records for one agent preset. */
export function tasksToMessages(tasks: TaskView[], agentPresetId: string, since?: string): ChatMessage[] {
  const rows = tasks
    .filter((t): t is TaskView => !!t)
    .filter((t) => (t.agentPresetId ?? '') === agentPresetId)
    .filter((t) => !since || (t.createdAt ?? '') >= since)
    .filter((t) => !isUnsentTask(t))
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

  const messages: ChatMessage[] = [];
  for (const t of rows) {
    const question = taskQuestionText(t);
    if (!question) continue;
    messages.push({ role: 'user', text: question });
    if (t.status === 'done') {
      const text = (t.result?.finalResponse ?? '').trim() || '（无回复）';
      messages.push({ role: 'assistant', text });
    } else if (t.status === 'failed') {
      messages.push({ role: 'assistant', text: (t.error || t.result?.finalResponse || '任务失败').trim() });
    } else if (t.status === 'running') {
      messages.push({ role: 'assistant', text: '（执行中…）', pending: true });
    }
  }
  return messages;
}

export function isQuotaError(message: string): boolean {
  return /配额/.test(message);
}

export type TaskWaitResult =
  | { kind: 'done'; text: string }
  | { kind: 'failed'; text: string }
  | { kind: 'timeout' }
  | { kind: 'cancelled' };

/** Poll a submitted task until done/failed, or until attempts are exhausted. */
export async function waitForTaskResult(
  getTask: (id: string) => Promise<{ task: TaskView }>,
  taskId: string,
  opts?: { maxAttempts?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void>; signal?: AbortSignal },
): Promise<TaskWaitResult> {
  const maxAttempts = opts?.maxAttempts ?? 120;
  const intervalMs = opts?.intervalMs ?? 1500;
  const sleep = opts?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const signal = opts?.signal;
  for (let i = 0; i < maxAttempts; i++) {
    if (signal?.aborted) return { kind: 'cancelled' };
    const g = await getTask(taskId);
    if (signal?.aborted || g.task.status === 'killed') {
      return { kind: 'cancelled' };
    }
    if (g.task.status === 'done') {
      const text = (g.task.result?.finalResponse ?? '').trim() || '（无回复）';
      return { kind: 'done', text };
    }
    if (g.task.status === 'failed') {
      return { kind: 'failed', text: (g.task.error || g.task.result?.finalResponse || '任务失败').trim() };
    }
    await sleep(intervalMs);
  }
  return { kind: 'timeout' };
}
