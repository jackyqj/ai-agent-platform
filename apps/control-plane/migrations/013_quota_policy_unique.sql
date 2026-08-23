-- 013：配额策略按范围+周期唯一（修复「设置/更新」每次插入新行）
-- 应用：psql -U adaptix -d control_plane -f 013_quota_policy_unique.sql

-- 1) 去重：同一 (scope_type, scope_id, period) 只保留最早一条
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY scope_type, COALESCE(scope_id, ''), period
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM quota_policies
)
DELETE FROM quota_policies
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2) 唯一约束（NULL scope_id 用空串折叠，避免多条 all 策略）
CREATE UNIQUE INDEX IF NOT EXISTS uq_quota_policies_scope_period
  ON quota_policies (scope_type, COALESCE(scope_id, ''), period);
