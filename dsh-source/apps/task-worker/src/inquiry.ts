export interface TaskInquiryOption {
  id: string
  label: string
  hint?: string
}

export interface TaskInquiryQuestion {
  id: string
  prompt: string
  header?: string
  detail?: string
  multiSelect?: boolean
  options: TaskInquiryOption[]
}

export interface TaskInquiry {
  requestId: string
  questions: TaskInquiryQuestion[]
}

export type TaskInquiryAnswer =
  | { requestId: string; cancelled: true }
  | { requestId: string; answers: { id: string; selected: string[]; custom?: string }[] }

export type TaskProgress =
  | { kind: 'inquiry'; inquiry: TaskInquiry }
  | { kind: 'inquiry-answered'; inquiry: TaskInquiry; answer: TaskInquiryAnswer }
  | { kind: 'working'; label?: string }

export function inquiryFromRequest(request: {
  requestId: string
  questions: Array<{
    id: string
    question: string
    header?: string
    detail?: string
    multiSelect?: boolean
    options?: Array<{ label: string; description?: string }>
  }>
}): TaskInquiry {
  return {
    requestId: request.requestId,
    questions: request.questions.map((question) => ({
      id: question.id,
      prompt: question.question,
      ...(question.header ? { header: question.header } : {}),
      ...(question.detail ? { detail: question.detail } : {}),
      ...(question.multiSelect ? { multiSelect: true } : {}),
      options: (question.options ?? []).map((option) => ({
        id: option.label,
        label: option.label,
        ...(option.description ? { hint: option.description } : {}),
      })),
    })),
  }
}

export function progressOf(value: unknown): TaskProgress | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const row = value as { kind?: unknown }
  if (row.kind === 'inquiry' || row.kind === 'inquiry-answered' || row.kind === 'working') {
    return value as TaskProgress
  }
  return undefined
}

export async function waitForInquiryAnswer(input: {
  requestId: string
  read: () => Promise<{ status: string; progress?: unknown } | undefined>
  signal: AbortSignal
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
}): Promise<{ cancelled: true } | { answers: { id: string; selected: string[]; custom?: string }[] }> {
  const intervalMs = input.intervalMs ?? 500
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  while (!input.signal.aborted) {
    const row = await input.read()
    if (!row || row.status === 'killed') return { cancelled: true }
    const progress = progressOf(row.progress)
    if (progress?.kind === 'inquiry-answered' && progress.answer.requestId === input.requestId) {
      if ('cancelled' in progress.answer && progress.answer.cancelled) return { cancelled: true }
      if ('answers' in progress.answer) return { answers: progress.answer.answers }
      return { cancelled: true }
    }
    await sleep(intervalMs)
  }
  return { cancelled: true }
}
