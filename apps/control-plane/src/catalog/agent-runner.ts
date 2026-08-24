import { TasksService } from '../tasks/tasks.service.js'
import type { AgentTaskRunner } from './types.js'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function taskQueueAgentRunner(tasks: TasksService): AgentTaskRunner {
  return async ({ userId, agentPresetId, task }) => {
    const rec = await tasks.submit(userId, agentPresetId, task)
    if (rec.awaitingApproval) {
      return { output: `awaitingApproval:${rec.id}`, awaitingApproval: true, taskId: rec.id }
    }
    const deadline = Date.now() + Number(process.env.CP_GRAPH_AGENT_TIMEOUT_MS ?? 120_000)
    while (Date.now() < deadline) {
      const t = await tasks.get(rec.id)
      if (!t) throw new Error('任务丢失')
      if (t.status === 'done') return { output: t.result?.finalResponse ?? '', taskId: rec.id }
      if (t.status === 'failed') throw new Error(t.error ?? 'Agent 执行失败')
      await sleep(Number(process.env.CP_GRAPH_AGENT_POLL_MS ?? 400))
    }
    throw new Error('Agent 节点超时')
  }
}
