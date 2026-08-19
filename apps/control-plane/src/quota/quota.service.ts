// 配额服务（16 工单）：策略解析（最具体者优先）+ 请求计数 + 拒绝/告警
// 当前可执行口径 = 请求数（任务数）；token/成本预算列预留网关（03）记账
import { Injectable, Logger } from '@nestjs/common'
import { PgStore } from '../store/pg.store.js'

export interface QuotaPolicy {
  id: string
  scopeType: 'user' | 'dept' | 'all'
  scopeId?: string
  period: 'day' | 'month'
  budgetRequests: number
  overPolicy: 'reject' | 'warn'
}

@Injectable()
export class QuotaService {
  private logger = new Logger('Quota')

  constructor(private readonly pg: PgStore) {}

  private periodStart(period: string): string {
    const d = new Date()
    return period === 'month'
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      : d.toISOString().slice(0, 10)
  }

  private async policies(): Promise<QuotaPolicy[]> {
    return (await this.pg.listQuotaPolicies()).map((r) => ({
      id: String(r.id),
      scopeType: r.scopeType as QuotaPolicy['scopeType'],
      scopeId: r.scopeId == null ? undefined : String(r.scopeId),
      period: r.period as QuotaPolicy['period'],
      budgetRequests: Number(r.budgetRequests),
      overPolicy: r.overPolicy as QuotaPolicy['overPolicy'],
    }))
  }

  /** 解析用户命中的策略：user → dept → all，最具体者优先 */
  private resolve(policies: QuotaPolicy[], userId: string, deptId: string | undefined): QuotaPolicy | undefined {
    const byScope = (type: QuotaPolicy['scopeType'], id?: string) => policies.find((p) => p.scopeType === type && p.scopeId === id)
    return byScope('user', userId) ?? byScope('dept', deptId) ?? byScope('all')
  }

  /**
   * 提交前配额门：命中策略且超限 → reject 抛错 / warn 放行并记日志
   */
  async checkAndRecord(userId: string, deptId: string | undefined): Promise<{ allowed: boolean; policy?: QuotaPolicy; used: number; budget: number }> {
    const policies = await this.policies()
    const policy = this.resolve(policies, userId, deptId)
    if (!policy) return { allowed: true, used: 0, budget: 0 }
    const period = this.periodStart(policy.period)
    const used = await this.pg.getUsage(policy.id, period)
    const allowed = used < policy.budgetRequests
    if (!allowed && policy.overPolicy === 'warn') {
      this.logger.warn(`quota warn: user ${userId} used ${used}/${policy.budgetRequests} (${policy.period})`)
    }
    if (allowed) {
      await this.pg.bumpUsage(policy.id, period)
    }
    return { allowed, policy, used: used + (allowed ? 1 : 0), budget: policy.budgetRequests }
  }

  async listPolicies(): Promise<QuotaPolicy[]> {
    return this.policies()
  }

  async upsert(input: { id?: string; scopeType: string; scopeId?: string; period?: string; budgetRequests: number; overPolicy?: string }): Promise<void> {
    await this.pg.upsertQuotaPolicy({
      id: input.id,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      period: input.period ?? 'day',
      budgetRequests: input.budgetRequests,
      overPolicy: input.overPolicy ?? 'reject',
    })
  }
}
