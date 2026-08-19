// 容器编排器（生产，podman/docker CLI）：DSH Web 实例 = 容器
// 本环境验证：podman 已实测容器启停/健康/销毁（见 06 工单 Comments）
// 镜像：company-dsh-web（02 工单公司 profile 镜像，含 persona/模型网关/MCP/preset 根注入）
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { get } from 'node:http'
import type { Instance, InstanceOrchestrator, SpawnOptions } from './orchestrator.interface.js'
import { loadConfig } from '../config/config.js'

const exec = promisify(execFile) as (
  cmd: string,
  args?: string[],
  opts?: { timeout?: number },
) => Promise<{ stdout: string; stderr: string }>

function portFrom(containerId: string, containerPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    // podman run 返回后端口映射可能尚需就绪：重试 5×300ms
    let tries = 0
    const attempt = () => {
      exec('podman', ['port', containerId, String(containerPort)])
        .then(({ stdout }) => {
          // 注意：本环境 Node 的 `$` 不匹配末尾换行前，先 trim 再匹配
          const m = stdout.trim().match(/(\d+)$/)
          if (m) return resolve(Number(m[1]))
          if (++tries < 5) return setTimeout(attempt, 300)
          resolve(0)
        })
        .catch(reject)
    }
    attempt()
  })
}

export class ContainerOrchestrator implements InstanceOrchestrator {
  private instances = new Map<string, Instance>()
  private cfg = loadConfig()
  private cmd = process.env.CP_CONTAINER_CMD ?? 'podman' // 生产可换 docker

  async getOrCreateWebInstance(opts: SpawnOptions): Promise<Instance> {
    const existing = [...this.instances.values()].find((i) => i.userId === opts.userId && i.type === 'web')
    if (existing && existing.status !== 'dead') {
      existing.lastHeartbeat = new Date().toISOString()
      return existing
    }
    if ((await this.count()) >= this.cfg.maxConcurrentInstances) {
      throw new Error('instance capacity exceeded')
    }
    const id = randomUUID()
    const envArgs = Object.entries(opts.env).flatMap(([k, v]) => ['-e', `${k}=${v}`])
    const name = `dsh-web-${opts.userId.slice(0, 12)}-${id.slice(0, 8)}`
    // 宿主端口自动分配（避免与孤儿容器/其他实例冲突），跑起来后用 podman port 读回
    const { stdout: containerId } = await exec(
      this.cmd,
      [
        'run', '-d', '--name', name,
        '-p', '127.0.0.1::3000',
        ...envArgs,
        '--health-cmd', 'wget -qO- http://127.0.0.1:3000/healthz || exit 1',
        this.cfg.dshWebImage,
      ],
      { timeout: 120_000 },
    ).catch((e) => {
      throw new Error(`container spawn failed: ${e.stderr ?? e.message}`)
    })
    const hostPort = await portFrom(containerId.trim(), 3000)
    if (!hostPort) throw new Error('container port mapping failed')
    const inst: Instance = {
      id,
      type: 'web',
      userId: opts.userId,
      host: '127.0.0.1',
      port: hostPort,
      status: 'spawning',
      containerId: containerId.trim(),
      spawnAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
    }
    this.instances.set(id, inst)
    // 等健康检查通过再置 ready（最多 ~5s；失败置 dead 由回收逻辑清理）
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500))
      if (await this.healthCheck(inst)) {
        inst.status = 'ready'
        break
      }
    }
    if (inst.status !== 'ready') inst.status = 'dead'
    return inst
  }

  async healthCheck(inst: Instance): Promise<boolean> {
    return new Promise((resolve) => {
      const req = get({ host: inst.host, port: inst.port, path: '/healthz', timeout: 3000 }, (res) => {
        res.resume()
        resolve(res.statusCode === 200)
      })
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
    })
  }

  async reapIdle(now: number): Promise<string[]> {
    const reaped: string[] = []
    for (const [id, inst] of this.instances) {
      const last = Date.parse(inst.lastHeartbeat)
      if (now - last > this.cfg.idleReapAfterMs) {
        await this.stop(id)
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
    const inst = this.instances.get(id)
    if (inst?.containerId) {
      await exec(this.cmd, ['rm', '-f', inst.containerId]).catch(() => undefined)
    }
    this.instances.delete(id)
  }
}
