import type { Approval, ChatItem, ChatMessage, TaskInquiry } from './types';

const HIDDEN_ASSISTANT = /^(（执行中…）|已提交，等待审批通过后执行。)$/;

export function buildChatTimeline(input: {
  messages: ChatMessage[];
  sending?: boolean;
  awaitingApproval?: boolean;
  pendingApprovals?: Approval[];
  runPhase?: 'queued' | 'running';
  inquiry?: TaskInquiry;
}): ChatItem[] {
  const items: ChatItem[] = [];
  for (const message of input.messages) {
    if (message.role === 'assistant' && (message.pending || HIDDEN_ASSISTANT.test(message.text.trim()))) {
      continue;
    }
    items.push(message.role === 'user' ? { kind: 'user', text: message.text } : { kind: 'assistant', text: message.text });
  }

  const pending = (input.pendingApprovals ?? []).filter((a) => a.status === 'pending');
  if (input.inquiry && input.inquiry.questions.length > 0) {
    const question = input.inquiry.questions[0]!;
    items.push({
      kind: 'inquiry',
      requestId: input.inquiry.requestId,
      questionId: question.id,
      prompt: question.header ? `${question.header} · ${question.prompt}` : question.prompt,
      options: question.options,
      multiSelect: question.multiSelect,
      detail: question.detail,
    });
  } else if (input.sending && input.awaitingApproval && pending.length === 0) {
    items.push({ kind: 'status', phase: 'queued', label: '等待审批' });
  } else if (input.sending && input.runPhase === 'queued') {
    items.push({ kind: 'status', phase: 'queued', label: '排队中' });
  } else if (input.sending && !input.awaitingApproval) {
    items.push({ kind: 'status', phase: 'running', label: '正在处理' });
  }
  for (const approval of pending) {
    items.push({
      kind: 'approval',
      approvalId: approval.id,
      action: approval.action,
      level: approval.level,
      status: 'pending',
    });
  }
  return items;
}

export function liveStripText(input: {
  error?: string | null;
  sending?: boolean;
  awaitingApproval?: boolean;
  pendingCount?: number;
  runPhase?: 'queued' | 'running';
  inquiry?: boolean;
}): string {
  if (input.error) return '待重试';
  if (input.inquiry) return '等待你选择方向';
  if (input.awaitingApproval || (input.pendingCount ?? 0) > 0) return '等待审批';
  if (input.sending && input.runPhase === 'queued') return '排队中';
  if (input.sending) return '正在处理';
  return '就绪';
}
