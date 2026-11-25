import { Injectable, Logger } from '@nestjs/common'
import { PgStore } from '../store/pg.store.js'

@Injectable()
export class FavoritesService {
  private logger = new Logger('Favorites')
  private memory = new Map<string, Set<string>>()

  constructor(private readonly pg: PgStore) {}

  private persist(): boolean {
    return this.pg.pool !== null
  }

  async list(userId: string): Promise<string[]> {
    if (this.persist()) {
      try {
        return await this.pg.listAgentFavorites(userId)
      } catch (e) {
        this.logger.error(`list favorites failed: ${(e as Error).message}`)
      }
    }
    return [...(this.memory.get(userId) ?? [])]
  }

  async add(userId: string, agentId: string): Promise<string[]> {
    if (this.persist()) {
      await this.pg.addAgentFavorite(userId, agentId)
      return this.list(userId)
    }
    const set = this.memory.get(userId) ?? new Set<string>()
    set.add(agentId)
    this.memory.set(userId, set)
    return [...set]
  }

  async remove(userId: string, agentId: string): Promise<string[]> {
    if (this.persist()) {
      await this.pg.removeAgentFavorite(userId, agentId)
      return this.list(userId)
    }
    this.memory.get(userId)?.delete(agentId)
    return [...(this.memory.get(userId) ?? [])]
  }

  async counts(): Promise<Record<string, number>> {
    if (this.persist()) {
      try {
        const rows = await this.pg.agentFavoriteCounts()
        const out: Record<string, number> = {}
        for (const r of rows) out[r.agentId] = r.n
        return out
      } catch (e) {
        this.logger.error(`favorite counts failed: ${(e as Error).message}`)
      }
    }
    const out: Record<string, number> = {}
    for (const set of this.memory.values()) {
      for (const id of set) out[id] = (out[id] ?? 0) + 1
    }
    return out
  }
}
