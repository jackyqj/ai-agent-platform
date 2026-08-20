import './config/load-env.js'
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from './app.module.js'
import { loadConfig } from './config/config.js'

async function bootstrap() {
  const cfg = loadConfig()
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())
  // 静态商店 UI（file:// 或本地静态服务器）跨域访问控制面 API
  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'x-api-key', 'x-routing-secret'],
  })
  // 业务 API 挂 /api；实例代理挂 /proxy（shell §7 契约）
  app.setGlobalPrefix('api', { exclude: ['proxy(.*)'] })
  await app.listen(cfg.port, '127.0.0.1')
  console.log(`[control-plane] listening on http://127.0.0.1:${cfg.port} (auth=${cfg.authMode}, orch=${cfg.orchestrator})`)
}

bootstrap().catch((e) => {
  console.error('boot failed:', e)
  process.exit(1)
})
