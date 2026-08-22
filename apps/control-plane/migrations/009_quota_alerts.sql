-- 009：配额告警闭环（16 工单收尾）
-- warn 策略超限时不再只打一条日志：落库一条可查询/可处置的告警记录，管理后台可见并一键处置。
-- 与 audit_events 互补：quota_alerts 是「待处置告警」的操作台账（open/resolve 生命周期），
-- audit_events 保留全量审计轨迹（quota.warn 事件）。

CREATE TABLE IF NOT EXISTS quota_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id       uuid NOT NULL REFERENCES quota_policies(id) ON DELETE CASCADE,
  user_id         TEXT,
  scope_type      TEXT NOT NULL,          -- user | dept | all
  scope_id        TEXT,
  period          TEXT NOT NULL,          -- day | month
  budget_requests INTEGER NOT NULL,
  used_requests   INTEGER NOT NULL,
  message         TEXT NOT NULL,
  resolved_at     TIMESTAMPTZ,            -- NULL = 未处置（open）
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quota_alerts_open   ON quota_alerts (resolved_at);
CREATE INDEX IF NOT EXISTS idx_quota_alerts_policy ON quota_alerts (policy_id, created_at);

-- 去重兜底：同一策略+周期+用户最多一条未处置告警（并发下由 DB 唯一索引保证，read-then-insert 仍可能竞态）。
CREATE UNIQUE INDEX IF NOT EXISTS uq_quota_alerts_open_dup
  ON quota_alerts (policy_id, period, user_id) NULLS NOT DISTINCT
  WHERE resolved_at IS NULL;
