// 内存编排器（开发/冒烟回退）：模拟实例生命周期，无真实容器
import { randomUUID } from 'node:crypto'
import type { Instance, InstanceOrchestrator, SpawnOptions } from './orchestrator.interface.js'
import { loadConfig } from '../config/config.js'

export class MemoryOrchestrator implements InstanceOrchestrator {
  private instances = new Map<string, Instance>()
  private cfg = loadConfig()

  async getOrCreateWebInstance(opts: SpawnOptions): Promise<Instance> {
    const existing = [...this.instances.values()].find((i) => i.userId === opts.userId && i.type === 'web')
    if (existing) {
      existing.lastHeartbeat = new Date().toISOString()
      existing.status = 'ready'
      return existing
    }
    const inst: Instance = {
      id: randomUUID(),
      type: 'web',
      userId: opts.userId,
      host: '127.0.0.1',
      port: 30000 + this.instances.size,
      status: 'ready', // memory 模式直接 ready
      spawnAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
    }
    this.instances.set(inst.id, inst)
    return inst
  }

  async healthCheck(): Promise<boolean> {
    return true
  }

  async reapIdle(now: number): Promise<string[]> {
    const reaped: string[] = []
    for (const [id, inst] of this.instances) {
      const last = Date.parse(inst.lastHeartbeat)
      if (now - last > this.cfg.idleReapAfterMs) {
        this.instances.delete(id)
        reaped.push(id)
      }
    }
    return reaped
  }

  async count(): Promise<number> {
    return this.instances.size
  }

  async list(): Promise<Instance[]> {
    return [...this.instances.values()]
  }

  async stop(id: string): Promise<void> {
    this.instances.delete(id)
  }
}
