-- 004：配额与用量（16 工单）
-- 应用：psql -U adaptix -d control_plane -f 004_quota.sql
-- 注：token/成本预算列预留（网关 03 落地后按模型用量记账）；当前可执行口径 = 请求数（任务数）

CREATE TABLE IF NOT EXISTS quota_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL,                 -- user | dept | all（最具体者优先）
  scope_id text,                            -- 用户 id / 部门；all 时为 NULL
  period text NOT NULL DEFAULT 'day',       -- day | month
  budget_requests int NOT NULL,             -- 周期内任务数上限（当前可执行口径）
  budget_tokens bigint,                     -- 预留：token 预算（网关记账用）
  budget_cost_cents bigint,                 -- 预留：成本预算
  over_policy text NOT NULL DEFAULT 'reject', -- reject | warn
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quota_scope ON quota_policies (scope_type, scope_id);

CREATE TABLE IF NOT EXISTS quota_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES quota_policies(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  used_requests int NOT NULL DEFAULT 0,
  used_tokens bigint NOT NULL DEFAULT 0,
  used_cost_cents bigint NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (policy_id, period_start)
);

-- 默认策略：全员每日 20 任务（试点档；admin 可调）
INSERT INTO quota_policies (scope_type, scope_id, period, budget_requests, over_policy)
VALUES ('all', NULL, 'day', 20, 'reject')
ON CONFLICT DO NOTHING;
