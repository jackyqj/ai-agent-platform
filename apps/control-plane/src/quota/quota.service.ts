// 配额服务（16 工单）：策略解析（最具体者优先）+ 请求计数 + 拒绝/告警
// 当前可执行口径 = 请求数（任务数）；token/成本预算列预留网关（03）记账
// v2 告警闭环：warn 超限不再只打日志——落 quota_alerts 可处置告警 + 审计事件，管理后台可查可处置。
import { Injectable, Logger } from '@nestjs/common'
import { PgStore } from '../store/pg.store.js'
import { AuditStore } from '../common/audit.store.js'

export interface QuotaPolicy {
  id: string
  scopeType: 'user' | 'dept' | 'all'
  scopeId?: string
  period: 'day' | 'month'
  budgetRequests: number
  overPolicy: 'reject' | 'warn'
}

export interface QuotaAlert {
  id: string
  policyId?: string
  userId?: string
  scopeType: 'user' | 'dept' | 'all'
  scopeId?: string
  period: 'day' | 'month'
  budgetRequests: number
  usedRequests: number
  message: string
  resolvedAt?: string | null
  createdAt: string
}

@Injectable()
export class QuotaService {
  private logger = new Logger('Quota')

  constructor(
    private readonly pg: PgStore,
    private readonly audit: AuditStore,
  ) {}

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
   * 提交前配额门：命中策略且超限 → reject 抛「应拒绝」(blocked) / warn 放行并落可处置告警（去重）。
   * deptId 由调用方传入；部门级策略（该用户所属部门）在缺省时无法命中。
   * blocked 是调用方是否应拒绝的唯一依据；warn 超限返回 blocked=false（放行但已告警）。
   */
  async checkAndRecord(userId: string, deptId: string | undefined): Promise<{ allowed: boolean; blocked: boolean; policy?: QuotaPolicy; used: number; budget: number }> {
    const policies = await this.policies()
    const policy = this.resolve(policies, userId, deptId)
    if (!policy) return { allowed: true, blocked: false, used: 0, budget: 0 }
    const period = this.periodStart(policy.period)
    const used = await this.pg.getUsage(policy.id, period)
    const allowed = used < policy.budgetRequests
    const blocked = !allowed && policy.overPolicy === 'reject'
    if (!allowed && policy.overPolicy === 'warn') {
      await this.warn(userId, policy, used)
    }
    if (allowed) {
      await this.pg.bumpUsage(policy.id, period)
    }
    return { allowed, blocked, policy, used: used + (allowed ? 1 : 0), budget: policy.budgetRequests }
  }

  /** warn 超限：同一策略+周期未处置告警存在则不重复（DB 部分唯一索引兜底并发）；否则落告警，落成才审计。持久化失败 fail-soft。 */
  private async warn(userId: string, policy: QuotaPolicy, used: number): Promise<void> {
    const scope = `${policy.scopeType}:${policy.scopeId ?? 'all'}`
    const message = `配额告警：${scope} 已达 ${used}/${policy.budgetRequests}（${policy.period}）`
    this.logger.warn(`quota warn: user ${userId} ${message}`)
    try {
      if (await this.pg.hasOpenQuotaAlert(policy.id, policy.period, userId)) return
      const inserted = await this.pg.insertQuotaAlert({
        policyId: policy.id, userId, scopeType: policy.scopeType, scopeId: policy.scopeId,
        period: policy.period, budgetRequests: policy.budgetRequests, usedRequests: used, message,
      })
      if (inserted) {
        await this.audit.append({
          userId, eventType: 'quota.warn',
          payload: { policyId: policy.id, scope, period: policy.period, used, budget: policy.budgetRequests },
        })
      }
    } catch (e) {
      this.logger.error(`quota alert persist failed: ${(e as Error).message}`)
    }
  }

  async listPolicies(): Promise<QuotaPolicy[]> {
    return this.policies()
  }

  async upsert(input: { id?: string; scopeType: string; scopeId?: string; period?: string; budgetRequests: number; overPolicy?: string }): Promise<void> {
    const period = input.period ?? 'day'
    const scopeType = input.scopeType as QuotaPolicy['scopeType']
    // 「全员」不带 scopeId；user/dept 用传入的 id。同一 (scope, period) 复用已有策略 id，避免每次新建。
    const scopeId = scopeType === 'all' ? undefined : (input.scopeId?.trim() || undefined)
    let id = input.id
    if (!id) {
      const existing = (await this.policies()).find(
        (p) => p.scopeType === scopeType && p.scopeId === scopeId && p.period === period,
      )
      id = existing?.id
    }
    await this.pg.upsertQuotaPolicy({
      id,
      scopeType,
      scopeId,
      period,
      budgetRequests: input.budgetRequests,
      overPolicy: input.overPolicy ?? 'reject',
    })
  }

  // --- 告警闭环 ---

  async listAlerts(f: { openOnly?: boolean; limit?: number }): Promise<QuotaAlert[]> {
    return (await this.pg.listQuotaAlerts({ openOnly: f.openOnly ?? true, limit: f.limit ?? 100 })).map((r) => ({
      id: String(r.id),
      policyId: r.policyId == null ? undefined : String(r.policyId),
      userId: r.userId == null ? undefined : String(r.userId),
      scopeType: String(r.scopeType) as QuotaAlert['scopeType'],
      scopeId: r.scopeId == null ? undefined : String(r.scopeId),
      period: String(r.period) as QuotaAlert['period'],
      budgetRequests: Number(r.budgetRequests),
      usedRequests: Number(r.usedRequests),
      message: String(r.message),
      resolvedAt: r.resolvedAt == null ? null : String(r.resolvedAt),
      createdAt: String(r.createdAt),
    }))
  }

  /** 处置(关闭)一条告警；返回是否真的发生了变更（已处置/不存在则 false）。成功后追一条处置审计。 */
  async resolveAlert(id: string, byUserId: string): Promise<{ ok: boolean }> {
    const ok = await this.pg.resolveQuotaAlert(id)
    if (ok) {
      await this.audit.append({ userId: byUserId, eventType: 'quota.alert.resolved', payload: { alertId: id } })
    }
    return { ok }
  }
}
