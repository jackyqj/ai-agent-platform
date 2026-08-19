// 服务身份 API Key（enterprise-shell §3.1 / 07 工单）：内部系统触发用
// 密钥明文只展示一次（签发时返回），库中仅存 sha256 hash；scope 限定能力。
import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { PgStore } from '../store/pg.store.js'
import { AuditStore } from '../common/audit.store.js'

export interface ApiKeyRecord {
  id: string
  name: string
  scopes: string[]
  status: 'active' | 'revoked'
}

export interface ServicePrincipal {
  keyId: string
  name: string
  scopes: string[]
}

@Injectable()
export class ApiKeysService {
  private memory = new Map<string, ApiKeyRecord & { keyHash: string }>() // PG 不可用回退

  constructor(
    private readonly pg: PgStore,
    private readonly audit: AuditStore,
  ) {}

  hash(key: string): string {
    return createHash('sha256').update(key).digest('hex')
  }

  private async persist(): Promise<boolean> {
    return this.pg.pool !== null
  }

  /** 签发：返回明文密钥（仅此一次），库中只存 hash */
  async create(name: string, scopes: string[], byUserId: string): Promise<{ id: string; name: string; apiKey: string; scopes: string[] }> {
    const id = randomUUID()
    const apiKey = `cp_${randomBytes(24).toString('base64url')}`
    const keyHash = this.hash(apiKey)
    if (await this.persist()) {
      await this.pg.insertApiKey({ id, name, keyHash, scopes })
    } else {
      this.memory.set(id, { id, name, scopes, status: 'active', keyHash })
    }
    await this.audit.append({ userId: byUserId, eventType: 'admin.apikey.create', payload: { keyId: id, name, scopes } })
    return { id, name, apiKey, scopes }
  }

  async list(): Promise<ApiKeyRecord[]> {
    if (await this.persist()) {
      try {
        const rows = await this.pg.listApiKeys()
        return rows.map((r) => ({
          id: r.id,
          name: r.name,
          scopes: r.scopes,
          status: r.status === 'revoked' ? 'revoked' as const : 'active' as const,
        }))
      } catch (e) {
        console.error('[apikeys] PG list failed, falling back:', (e as Error).message)
      }
    }
    return [...this.memory.values()].map(({ keyHash: _kh, ...k }) => k)
  }

  async revoke(id: string, byUserId: string): Promise<void> {
    if (await this.persist()) {
      await this.pg.revokeApiKey(id)
    } else {
      const k = this.memory.get(id)
      if (k) k.status = 'revoked'
    }
    await this.audit.append({ userId: byUserId, eventType: 'admin.apikey.revoke', payload: { keyId: id } })
  }

  /** 校验（X-API-Key → 服务身份）；scope 缺省不校验，传了则必须包含 */
  async validate(key: string, requiredScope?: string): Promise<ServicePrincipal> {
    const keyHash = this.hash(key)
    let record: (ApiKeyRecord & { keyHash: string }) | undefined
    if (await this.persist()) {
      const row = await this.pg.getApiKeyByHash(keyHash)
      if (row) {
        record = {
          id: row.id as string,
          name: row.name as string,
          scopes: row.scopes as string[],
          status: row.status === 'revoked' ? 'revoked' : 'active',
          keyHash,
        }
        await this.pg.touchApiKey(row.id as string).catch(() => undefined)
      }
    } else {
      record = [...this.memory.values()].find((k) => k.keyHash === keyHash)
    }
    if (!record) throw new UnauthorizedException('invalid api key')
    if (record.status !== 'active') throw new UnauthorizedException('api key revoked')
    if (requiredScope && !record.scopes.includes(requiredScope)) {
      throw new ForbiddenException(`scope ${requiredScope} not granted`)
    }
    return { keyId: record.id, name: record.name, scopes: record.scopes }
  }
}
