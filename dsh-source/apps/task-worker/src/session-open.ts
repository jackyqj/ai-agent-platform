export function errorText(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause instanceof Error ? ` ${err.cause.message}` : ''
    return `${err.message}${cause}`
  }
  return String(err)
}

export function isSessionNotFound(err: unknown, sessionId: string): boolean {
  const text = errorText(err)
  return text.includes(`session "${sessionId}" not found`) || /\bsession not found\b/i.test(text)
}

export function isSessionAlreadyExists(err: unknown, sessionId: string): boolean {
  return errorText(err).includes(`session "${sessionId}" already exists`)
}

export interface SessionRuntime<T> {
  resumeSession(sessionId: string): Promise<unknown>
  run(input: string, options: { sessionId: string }): Promise<T>
}

/** Resume when present and bind workspace only then; otherwise the first prompt creates. */
export async function promptOnSession<T>(
  harness: SessionRuntime<T>,
  sessionId: string,
  input: string,
  bindWorkspace?: (sessionId: string) => Promise<void>,
): Promise<T> {
  let resumed = false
  try {
    await harness.resumeSession(sessionId)
    resumed = true
  } catch (err) {
    if (!isSessionNotFound(err, sessionId)) throw err
  }
  if (resumed) await bindWorkspace?.(sessionId)
  try {
    return await harness.run(input, { sessionId })
  } catch (err) {
    if (resumed || !isSessionAlreadyExists(err, sessionId)) throw err
    await harness.resumeSession(sessionId)
    await bindWorkspace?.(sessionId)
    return harness.run(input, { sessionId })
  }
}
