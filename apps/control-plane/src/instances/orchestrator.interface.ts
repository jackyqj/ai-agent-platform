// 实例编排器接口（06 工单）：启停/健康/回收/容量
export interface Instance {
  id: string
  type: 'web' | 'rpc'
  userId?: string
  host: string
  port: number
  status: 'spawning' | 'ready' | 'busy' | 'idle' | 'reaping' | 'dead'
  containerId?: string
  spawnAt: string
  lastHeartbeat: string
}

export interface SpawnOptions {
  userId: string
  /** 实例注入的 env（模型网关、MCP、preset 根、OTel…，02 工单 profile 镜像） */
  env: Record<string, string>
}

export interface InstanceOrchestrator {
  /** 为某用户获取/创建 Web 实例（懒启动） */
  getOrCreateWebInstance(opts: SpawnOptions): Promise<Instance>
  /** 健康检查（loopback 探 /healthz） */
  healthCheck(instance: Instance): Promise<boolean>
  /** 空闲回收：lastHeartbeat 超时 → 停止 */
  reapIdle(now: number): Promise<string[]>
  /** 容量：当前并发实例数 */
  count(): Promise<number>
  list(): Promise<Instance[]>
  stop(id: string): Promise<void>
}
