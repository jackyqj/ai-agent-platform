// 平台任务 Worker（19 工单）——独立进程，跑在 dsh-source 工作区
// 可靠性批：崩溃重试（BullMQ attempts+backoff）、超时、人工取消（含运行中）、
// 同用户串行（per-user 链）、孤儿任务回收（启动+周期扫描）
import { Worker, type Job } from 'bullmq'
import pg from 'pg'
import { DeepSeekHarness, type RunResult } from '@deepseek-ai/dsh-sdk-client'
import { lookupSecret } from '@deepseek-ai/dsh-credentials-pg'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDshSessionId } from './resolve-session-id.js'

loadPlatformEnv()

const REDIS_URL = process.env.CP_REDIS_URL ?? 'redis://127.0.0.1:6379'
const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.PG_DSN ??
  'postgres://adaptix:adaptix_password@127.0.0.1:5432/control_plane'
const pool = new pg.Pool({ connectionString: DATABASE_URL })

const cfg = {
  attempts: Number(process.env.CP_TASK_ATTEMPTS ?? 3),
  backoffMs: Number(process.env.CP_TASK_BACKOFF_MS ?? 3000),
  timeoutMs: Number(process.env.CP_TASK_TIMEOUT_MS ?? 5 * 60 * 1000),
  concurrency: Number(process.env.CP_WORKER_CONCURRENCY ?? 2),
  orphanGraceMs: Number(process.env.CP_ORPHAN_GRACE_MS ?? 10 * 60 * 1000),
  cancelPollMs: Number(process.env.CP_CANCEL_POLL_MS ?? 3000),
}
const runtimeModel = process.env.DSH_MODEL ?? process.env.DS_API_MODEL ?? 'cloud/deepseek'
const runtimeViaGateway = runtimeModel.startsWith('cloud/')
const runtime = {
  bin: process.env.CP_RUNTIME_BIN ?? fileURLToPath(new URL('../../../examples/jsonrpc-demo/lib/bin.js', import.meta.url)),
  cordis: process.env.CP_RUNTIME_CORDIS ?? fileURLToPath(new URL('../worker.cordis.yml', import.meta.url)),
  // cloud/* → LiteLLM；直连模型 → api.deepseek.com（可用 DEEPSEEK_BASE_URL 覆盖）。
  model: runtimeModel,
  workspace: process.env.DSH_CWD ?? fileURLToPath(new URL('../workspace', import.meta.url)),
  baseURL:
    process.env.DEEPSEEK_BASE_URL ??
    (runtimeViaGateway ? 'http://127.0.0.1:4001/v1' : 'https://api.deepseek.com'),
}

/** Load control-plane .env (DS_API_KEY / CP_JWT_SECRET) without overriding a live shell. */
function loadPlatformEnv(): void {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '../../../../../apps/control-plane/.env')
  if (existsSync(envPath)) process.loadEnvFile(envPath)
}

/** D20: vault first, then process env. Re-resolved per task for MCP child env. */
async function resolveRef(ref: string): Promise<string> {
  const master = process.env.SECRETS_MASTER_KEY || process.env.CP_JWT_SECRET || ''
  if (master) {
    try {
      const value = await lookupSecret(pool, master, ref)
      if (value) return value
    } catch {
      // table missing on a fresh DB — fall through to env
    }
  }
  return process.env[ref] || ''
}

async function q<T>(text: string, args: unknown[] = []): Promise<{ rows: T[] }> {
  return pool.query(text, args)
}

function normalizeTaskPayload(raw: unknown): { task?: string; permissionMode?: string; sessionId?: string } {
  if (raw == null) return {}
  let value: unknown = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return { task: value }
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return {}
  const obj = value as Record<string, unknown>
  return {
    task: typeof obj.task === 'string' ? obj.task : undefined,
    permissionMode: typeof obj.permissionMode === 'string' ? obj.permissionMode : undefined,
    sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
  }
}

async function getTask(taskId: string): Promise<{
  id: string
  userId: string
  status: string
  payload: { task?: string; permissionMode?: string; sessionId?: string }
} | undefined> {
  const { rows } = await q<{
    id: string
    userId: string
    status: string
    payload: unknown
  }>(
    `SELECT id, user_id AS "userId", status, payload FROM tasks WHERE id = $1`,
    [taskId],
  )
  const row = rows[0]
  if (!row) return undefined
  return { ...row, payload: normalizeTaskPayload(row.payload) }
}

/** rc.8 RunResult no longer carries finishReason; take it from the last turn/end. */
function finishReasonOf(result: RunResult): string | undefined {
  for (let i = result.events.length - 1; i >= 0; i--) {
    const event = result.events[i]
    if (event?.type === 'turn/end') return event.data.reason.kind
  }
  return undefined
}

/** Prefer provider error text when the turn ends without a usable assistant reply. */
function turnErrorMessage(result: RunResult): string | undefined {
  for (let i = result.events.length - 1; i >= 0; i--) {
    const event = result.events[i]
    if (event?.type !== 'turn/end') continue
    const reason = event.data.reason as { kind?: string; error?: { message?: string }; message?: string }
    if (reason.kind !== 'error') return undefined
    const msg = reason.error?.message || reason.message
    return msg?.trim() || '模型调用失败'
  }
  return undefined
}

async function patchTask(id: string, p: { status?: string; result?: unknown; error?: string; started?: boolean; finished?: boolean }) {
  const sets: string[] = []
  const args: unknown[] = []
  if (p.status) { args.push(p.status); sets.push(`status = $${args.length}`) }
  if (p.result !== undefined) { args.push(JSON.stringify(p.result)); sets.push(`result = $${args.length}`) }
  if (p.error !== undefined) { args.push(p.error); sets.push(`error = $${args.length}`) }
  if (p.started) sets.push('started_at = now()')
  if (p.finished) sets.push('finished_at = now()')
  if (sets.length === 0) return
  args.push(id)
  await pool.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $${args.length}`, args)
}

async function audit(userId: string, eventType: string, payload: unknown) {
  await pool.query(
    `INSERT INTO audit_events (user_id, event_type, payload) VALUES ($1, $2, $3)`,
    [userId, eventType, JSON.stringify(payload)],
  ).catch(() => undefined)
}

/** 运行中取消：轮询任务状态，被 kill 则关闭 harness（杀掉运行时子进程）→ run 中止 */
async function runWithCancel(
  job: Job,
  taskId: string,
  taskText: string,
  attempt: number,
  permissionMode: string,
  storeSessionId?: string,
): Promise<void> {
  let harness: DeepSeekHarness | undefined
  const stopPolling = { active: true }
  const poller = setInterval(async () => {
    if (!stopPolling.active) return
    const t = await getTask(taskId).catch(() => undefined)
    if (t && t.status === 'killed') {
      stopPolling.active = false
      await harness?.close().catch(() => undefined) // 杀掉运行时 → run 抛 TransportClosed
    }
  }, cfg.cancelPollMs)

  try {
    harness = new DeepSeekHarness({
      launch: {
        command: process.execPath,
        args: [runtime.bin, runtime.cordis],
        // rc.8: a provided env object replaces the child environment entirely.
        env: {
          ...process.env,
          DATABASE_URL,
          PG_DSN: DATABASE_URL,
          SECRETS_MASTER_KEY: process.env.SECRETS_MASTER_KEY || process.env.CP_JWT_SECRET || '',
          CP_JWT_SECRET: process.env.CP_JWT_SECRET || '',
          DEEPSEEK_BASE_URL: runtime.baseURL,
          DSH_CWD: runtime.workspace,
          DSH_MODEL: runtime.model,
          EMBED_API_KEY: await resolveRef('EMBED_API_KEY'),
          // Gateway path: credentials-pg prefers vault; env is fallback for local boots.
          GATEWAY_KEY: (await resolveRef('GATEWAY_KEY')) || process.env.GATEWAY_KEY || '',
          // Direct-path fallback only.
          DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || process.env.DS_API_KEY || '',
          DSH_PERMISSION_MODE: permissionMode,
        },
      },
      provider: 'deepseek-official',
      model: runtime.model,
      maxTokens: 8192,
    })
    const sessionId = resolveDshSessionId({ storeSessionId, taskId, attempt })
    console.log(
      `[worker] task ${taskId} spawning runtime session=${sessionId}`
      + ` (storeSessionId=${storeSessionId?.trim() || 'none'})`,
    )
    const result = await Promise.race([
      harness.run(taskText, { sessionId }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('task timeout'), { code: 'TIMEOUT' })), cfg.timeoutMs),
      ),
    ])
    const t = await getTask(taskId)
    if (t?.status === 'killed') {
      // 运行期间被取消：结果丢弃，状态保持 killed
      await patchTask(taskId, { status: 'killed', finished: true })
      await audit(t.userId, 'task.cancelled', { taskId, reason: 'cancelled-while-running' })
      return
    }
    const finishReason = finishReasonOf(result)
    const turnError = turnErrorMessage(result)
    const finalResponse = (result.finalResponse ?? '').trim()
    if (finishReason === 'error' || (!finalResponse && turnError)) {
      const error = turnError || '模型调用失败'
      await patchTask(taskId, {
        status: 'failed',
        error,
        result: { finalResponse: finalResponse || error, finishReason: finishReason ?? 'error' },
        finished: true,
      })
      await audit(t!.userId, 'task.failed', { taskId, sessionId, error, finishReason })
      console.log(`[worker] task ${taskId} failed (${finishReason ?? 'error'}): ${error}`)
      return
    }
    await patchTask(taskId, { status: 'done', result: { finalResponse, finishReason }, finished: true })
    await audit(t!.userId, 'task.completed', { taskId, sessionId })
    console.log(`[worker] task ${taskId} done (${finishReason ?? 'unknown'})`)
  } finally {
    stopPolling.active = false
    clearInterval(poller)
    await harness?.close().catch(() => undefined)
  }
}

/** 单次执行（BullMQ 会在失败时按 attempts/backoff 重试） */
async function execute(job: Job<{ taskId: string }>): Promise<void> {
  const taskId = job.data.taskId
  const task = await getTask(taskId)
  if (!task) throw new Error(`task ${taskId} not found`)
  if (task.status === 'killed') {
    // 入队后被取消但 job 未及时移除
    await patchTask(taskId, { status: 'killed', finished: true })
    return
  }
  if (task.status === 'done' || task.status === 'failed') {
    throw new Error(`task ${taskId} terminal (status=${task.status})`)
  }
  // queued（首次）或 running（重试中）都继续

  const attempt = job.attemptsMade + 1
  console.log(`[worker] task ${taskId} attempt ${attempt} starting`)
  if (attempt === 1) {
    await patchTask(taskId, { status: 'running', started: true })
  } else {
    await patchTask(taskId, { status: 'running' })
  }
  await runWithCancel(
    job,
    taskId,
    task.payload?.task ?? '',
    attempt,
    task.payload?.permissionMode ?? 'workspace-write',
    task.payload?.sessionId,
  )
}

// ── 同用户串行：同一 userId 的任务链式执行，不同用户可并行 ────────────────
const chains = new Map<string, Promise<unknown>>()
function serialize<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(userId) ?? Promise.resolve()
  const next = prev.then(fn, fn) // 前序失败不阻塞后续
  chains.set(userId, next.catch(() => undefined))
  return next
}

// ── 孤儿回收 ───────────────────────────────────────────────────────────────
async function sweepOrphans(label: string, graceMs: number): Promise<void> {
  const { rowCount } = await pool.query(
    `UPDATE tasks SET status = 'failed', error = $1, finished_at = now()
     WHERE status = 'running' AND started_at < now() - make_interval(secs => $2)`,
    [`orphaned: ${label}`, Math.max(1, graceMs / 1000)],
  )
  if (rowCount) console.log(`[worker] orphan sweep (${label}): ${rowCount} tasks marked failed`)
}

// ── 装配 ───────────────────────────────────────────────────────────────────
const worker = new Worker(
  'agent-tasks',
  async (job) => {
    const task = await getTask(job.data.taskId)
    const userId = task?.userId ?? 'unknown'
    await serialize(userId, () => execute(job))
  },
  {
    connection: { url: REDIS_URL },
    concurrency: cfg.concurrency,
    // 崩溃重试：3 次指数退避；失败（含超时/运行取消）由 'failed' 事件收尾
    attempts: cfg.attempts,
    backoff: { type: 'exponential', delay: cfg.backoffMs },
  },
)

worker.on('ready', async () => {
  console.log(`[worker] ready (redis=${REDIS_URL}, concurrency=${cfg.concurrency}, attempts=${cfg.attempts}, model=${runtime.model})`)
  await sweepOrphans('worker-startup', 0) // 启动即回收孤儿（单 worker 假设）
  setInterval(() => sweepOrphans('stuck', cfg.orphanGraceMs), 60_000)
})
worker.on('failed', async (job, err) => {
  const taskId = job?.data.taskId as string
  const task = await getTask(taskId).catch(() => undefined)
  if (task?.status === 'killed') return // 取消的任务不覆盖
  const total = job?.opts.attempts ?? cfg.attempts
  const made = job?.attemptsMade ?? 1
  const isFinal = made >= total
  const message = `${err.message} (attempts=${made}/${total})`
  if (isFinal) {
    await patchTask(taskId, { status: 'failed', error: message, finished: true }).catch(() => undefined)
    await audit(task?.userId ?? 'unknown', 'task.failed', { taskId, error: message })
    console.error(`[worker] task ${taskId} failed (final): ${message}`)
  } else {
    console.warn(`[worker] task ${taskId} attempt ${made}/${total} failed, will retry: ${message}`)
  }
})

process.on('SIGINT', async () => { await worker.close(); await pool.end(); process.exit(0) })
process.on('SIGTERM', async () => { await worker.close(); await pool.end(); process.exit(0) })
