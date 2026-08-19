import { Injectable, OnModuleInit, Logger } from '@nestjs/common'
import { loadConfig } from '../config/config.js'
import { PgStore } from '../store/pg.store.js'
import type { Instance, InstanceOrchestrator } from './orchestrator.interface.js'
import { MemoryOrchestrator } from './memory.orchestrator.js'
import { ContainerOrchestrator } from './container.orchestrator.js'

/**
 * 实例编排门面（06/08）：编排器负责容器生命周期（live 权威），
 * PG 持久化实例生命周期事件（跨重启可追溯，08）。PG 不可用只影响历史视图。
 */
@Injectable()
export class InstancesService implements InstanceOrchestrator, OnModuleInit {
  private logger = new Logger('Instances')
  private impl!: InstanceOrchestrator

  constructor(private readonly pg: PgStore) {}

  onModuleInit() {
    const mode = loadConfig().orchestrator
    this.impl = mode === 'docker' ? new ContainerOrchestrator() : new MemoryOrchestrator()
    this.logger.log(`orchestrator=${mode}`)
    // 空闲回收巡检（生产由控制面定时任务驱动；这里演示用）
    setInterval(async () => {
      const reaped = await this.impl.reapIdle(Date.now())
      for (const id of reaped) {
        await this.pg.markInstanceDead(id).catch(() => undefined)
      }
      if (reaped.length) this.logger.log(`reaped idle instances: ${reaped.join(',')}`)
    }, 60_000)
  }

  async getOrCreateWebInstance(opts: { userId: string; env: Record<string, string> }) {
    const inst = await this.impl.getOrCreateWebInstance(opts)
    // 持久化实例生命周期（INSERT 幂等：同 id 已存在则更新状态）
    await this.pg
      .insertInstance({
        id: inst.id,
        type: inst.type,
        userId: inst.userId,
        host: inst.host,
        port: inst.port,
        status: inst.status,
        containerId: inst.containerId,
      })
      .catch(() => this.pg.updateInstance({ id: inst.id, status: inst.status, heartbeat: true }).catch(() => undefined))
    return inst
  }

  async healthCheck(instance: Parameters<InstanceOrchestrator['healthCheck']>[0]) {
    const ok = await this.impl.healthCheck(instance)
    // 心跳：无论结果都刷新 last_heartbeat，状态按结果
    await this.pg
      .updateInstance({ id: instance.id, status: ok ? 'ready' : 'dead', heartbeat: true })
      .catch(() => undefined)
    return ok
  }

  async reapIdle(now: number) {
    return this.impl.reapIdle(now)
  }

  async count() {
    return this.impl.count()
  }

  /** 历史视图来自 PG（跨重启可查）；PG 不可用时回退编排器 live 列表 */
  async list(): Promise<import('./orchestrator.interface.js').Instance[]> {
    if (this.pg.pool) {
      try {
        const rows = await this.pg.listInstances()
        return rows.map((r) => ({
          id: r.id,
          type: r.type === 'rpc' ? 'rpc' as const : 'web' as const,
          userId: r.userId ?? undefined,
          host: r.host,
          port: r.port,
          status: r.status as Instance['status'],
          containerId: r.containerId ?? undefined,
          spawnAt: r.spawnAt,
          lastHeartbeat: r.lastHeartbeat,
        }))
      } catch (e) {
        console.error('[instances] PG list failed, falling back:', (e as Error).message)
      }
    }
    return this.impl.list()
  }

  async stop(id: string) {
    await this.impl.stop(id)
    await this.pg.markInstanceDead(id).catch(() => undefined)
  }
}
