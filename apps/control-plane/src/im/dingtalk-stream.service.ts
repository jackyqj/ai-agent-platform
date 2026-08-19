// 钉钉 Stream 模式接入（18 工单）：官方 SDK 长连接 + 自动重连 + 消息回调
// 仅当配置了 CP_DINGTALK_CLIENT_ID/SECRET（或复用 OIDC 凭证）时启动
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { DWClient, TOPIC_ROBOT, type DWClientDownStream, type RobotTextMessage } from 'dingtalk-stream'
import { loadConfig } from '../config/config.js'
import { ImService } from './im.service.js'

@Injectable()
export class DingtalkStreamService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger('DingTalkStream')
  private client?: DWClient
  private connecting = false

  constructor(private readonly im: ImService) {}

  onModuleInit() {
    const { clientId, clientSecret } = loadConfig().dingtalk
    if (!clientId || !clientSecret) {
      this.logger.warn('未配置钉钉凭证（CP_DINGTALK_CLIENT_ID/SECRET 或 CP_OIDC_*），IM 机器人未启动')
      return
    }
    this.client = new DWClient({ clientId, clientSecret, debug: process.env.CP_DEBUG === '1' })
    // 机器人收消息回调（自动 WS ack；回调内异常由 ImService 消化）
    this.client.registerCallbackListener(TOPIC_ROBOT, (msg: DWClientDownStream) => void this.onRobotMessage(msg))
    this.client.on('error', (e) => this.logger.error(`stream error: ${(e as Error)?.message ?? e}`))
    void this.connect()
  }

  onModuleDestroy() {
    this.client?.disconnect()
  }

  /** 供管理端点：当前是否已连接 */
  isConnected(): boolean {
    return this.client?.connected ?? false
  }

  private async connect() {
    if (this.connecting) return
    this.connecting = true
    try {
      await this.client!.connect()
      this.logger.log(`钉钉 Stream 已连接（connected=${this.client!.connected}）`)
    } catch (e) {
      this.logger.error(`钉钉 Stream 连接失败: ${(e as Error).message}（SDK 将自动重试）`)
    } finally {
      this.connecting = false
    }
  }

  private async onRobotMessage(msg: DWClientDownStream) {
    let data: RobotTextMessage
    try {
      data = JSON.parse(msg.data) as RobotTextMessage
    } catch {
      return
    }
    try {
      await this.im.handleInbound(data)
    } catch (e) {
      this.logger.error(`IM inbound failed: ${(e as Error).message}`)
    }
  }
}
