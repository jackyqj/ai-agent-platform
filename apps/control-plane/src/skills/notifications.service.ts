import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { PgStore } from '../store/pg.store.js'
import { MemoryNotificationsRepo, PgNotificationsRepo, type NotificationsRepo } from './skills.store.js'
import type { InboxItem, NotificationKind } from './types.js'

@Injectable()
export class NotificationsService {
  private readonly repo: NotificationsRepo

  constructor(pg: PgStore) {
    this.repo = pg.pool ? new PgNotificationsRepo(pg.pool) : new MemoryNotificationsRepo()
  }

  async notify(userId: string, kind: NotificationKind, payload: Record<string, unknown>): Promise<InboxItem> {
    const item: InboxItem = {
      id: randomUUID(),
      userId,
      kind,
      payload,
      createdAt: new Date().toISOString(),
    }
    await this.repo.insert(item)
    return item
  }

  async list(userId: string): Promise<{ notifications: InboxItem[]; unread: number }> {
    const notifications = await this.repo.listFor(userId)
    return { notifications, unread: notifications.filter((n) => !n.readAt).length }
  }

  async markRead(userId: string, ids?: string[]): Promise<{ notifications: InboxItem[]; unread: number }> {
    await this.repo.markRead(userId, ids)
    return this.list(userId)
  }
}
