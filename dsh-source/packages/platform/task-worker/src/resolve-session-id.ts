/**
 * Pick the DSH session id for a worker run.
 * Store chat sessions reuse one durable id across turns; one-shot tasks
 * (graphs, cron, IM) keep per-attempt isolation for clean retries.
 */
export function resolveDshSessionId(opts: {
  storeSessionId?: string | null
  taskId: string
  attempt: number
}): string {
  const sid = opts.storeSessionId?.trim()
  if (sid) return sid
  return `task-${opts.taskId}-a${opts.attempt}`
}
