// 实例代理（enterprise-shell §3.3/§6）：浏览器流量唯一入口
// 三重校验：JWT（AuthGuard）→ 会话归属（session.userId === jwt.sub）→ routing_secret
// 通过后转发到用户实例（loopback）；实例不直接暴露给客户端。
import {
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { request } from 'node:http'
import { AuthGuard } from '../common/auth.guard.js'
import { AuditStore } from '../common/audit.store.js'
import { SessionsService } from '../sessions/sessions.service.js'
import { InstancesService } from '../instances/instances.service.js'

@Controller('proxy')
@UseGuards(AuthGuard)
export class ProxyController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly instances: InstancesService,
    private readonly audit: AuditStore,
  ) {}

  @Get(':sessionId/*')
  async forward(
    @Req() req: { user: { sub: string }; url: string },
    @Res() res: FastifyReply,
    @Param('sessionId') sessionId: string,
    @Headers('x-routing-secret') routingSecret?: string,
  ) {
    // 提取通配路径：/proxy/{sessionId}/{path...} → ['', 'proxy', sid, rest...] → slice(3) = rest
    const path = req.url.split('/').slice(3).join('/')
    const s = await this.sessions.get(sessionId)
    // 校验 1：会话存在
    if (!s) throw new HttpException('session not found', HttpStatus.NOT_FOUND)
    // 校验 2：会话归属当前用户
    if (s.userId !== req.user.sub) throw new HttpException('forbidden', HttpStatus.FORBIDDEN)
    // 校验 3：routing_secret
    if (!routingSecret || routingSecret !== s.routingSecret) {
      await this.audit.append({ userId: req.user.sub, sessionId, eventType: 'proxy.denied', payload: { reason: 'bad routing secret' } })
      throw new HttpException('forbidden', HttpStatus.FORBIDDEN)
    }
    // 路由到实例
    if (!s.instanceId) throw new HttpException('no instance', HttpStatus.SERVICE_UNAVAILABLE)
    const inst = (await this.instances.list()).find((i) => i.id === s.instanceId)
    if (!inst) throw new HttpException('instance gone', HttpStatus.SERVICE_UNAVAILABLE)

    await this.audit.append({ userId: req.user.sub, sessionId, eventType: 'proxy.forward', payload: { path } })
    const { status, body, contentType } = await this.fetchFromInstance(inst.host, inst.port, path)
    // 透传实例状态码与 content-type（浏览器看到的与直连实例一致）
    res.status(status).type(contentType).send(body)
  }

  /** 转发 GET 并透传 body（v1 骨架只做 GET；WebSocket/SSE 升级路由为 06 后续迭代） */
  private fetchFromInstance(
    host: string,
    port: number,
    path: string,
  ): Promise<{ status: number; body: string; contentType: string }> {
    return new Promise((resolve, reject) => {
      const req = request({ host, port, path: '/' + path, timeout: 5000 }, (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 502,
            body,
            contentType: String(res.headers['content-type'] ?? 'text/html; charset=utf-8'),
          }),
        )
      })
      req.on('error', () => reject(new HttpException('instance unreachable', HttpStatus.BAD_GATEWAY)))
      req.on('timeout', () => {
        req.destroy()
        reject(new HttpException('instance timeout', HttpStatus.GATEWAY_TIMEOUT))
      })
      req.end()
    })
  }
}
