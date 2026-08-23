// 钉钉 Stream 模式接入（18 工单）：官方 SDK 长连接 + 自动重连 + 消息回调
// 仅当配置了 CP_DINGTALK_CLIENT_ID/SECRET（或复用 OIDC 凭证）时启动
// 注意：TOPIC_ROBOT 是 CALLBACK 类型，SDK 不会自动 ack，必须 socketCallBackResponse，否则约 60s 重推。
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { DWClient, TOPIC_ROBOT, type DWClientDownStream, type RobotTextMessage } from 'dingtalk-stream'
import { loadConfig } from '../config/config.js'
import { ImService } from './im.service.js'
import { SecretsService } from '../secrets/secrets.service.js'

@Injectable()
export class DingtalkStreamService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger('DingTalkStream')
  private client?: DWClient
  private connecting = false

  constructor(
    private readonly im: ImService,
    private readonly secrets: SecretsService,
  ) {}

  async onModuleInit() {
    const { clientId } = loadConfig().dingtalk
    const clientSecret =
      (await this.secrets.resolve('CP_DINGTALK_CLIENT_SECRET'))?.value ??
      (await this.secrets.resolve('CP_OIDC_CLIENT_SECRET'))?.value
    if (!clientId || !clientSecret) {
      this.logger.warn('未配置钉钉凭证（CP_DINGTALK_CLIENT_ID/SECRET 或 CP_OIDC_*），IM 机器人未启动')
      return
    }
    this.client = new DWClient({ clientId, clientSecret, debug: process.env.CP_DEBUG === '1' })
    // 机器人收消息回调（CALLBACK 需手动 ack，见 onRobotMessage）
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
    // CALLBACK 类型不会自动 ack；若不回执，钉钉约 60s 内会重推同一条 → 任务被处理两次。
    const messageId = msg.headers?.messageId
    if (messageId) {
      try {
        this.client?.socketCallBackResponse(messageId, { status: 'OK' })
      } catch (e) {
        this.logger.warn(`IM callback ack failed: ${(e as Error).message}`)
      }
    }

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
