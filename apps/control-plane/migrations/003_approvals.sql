-- 003：审批与提审（14/12 工单）
-- 应用：psql -U adaptix -d control_plane -f 003_approvals.sql

CREATE TABLE IF NOT EXISTS approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id text NOT NULL,
  task_id uuid,                                 -- 关联任务（审批通过后入队）
  agent_preset_id text NOT NULL,
  action text NOT NULL,                         -- 描述（如：执行数据报表任务）
  level text NOT NULL DEFAULT 'self',           -- self | manager
  status text NOT NULL DEFAULT 'pending',       -- pending | approved | rejected | cancelled
  decided_by text,
  decided_at timestamptz,
  expires_at timestamptz,                       -- 授权有效期（记住 X 小时）
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_pending ON approval_requests (status, created_at);
CREATE INDEX IF NOT EXISTS idx_approval_user ON approval_requests (requester_user_id, created_at DESC);

-- 提审：agent_presets 增加基于模板列（员工 propose → draft，admin 批准后生成 preset 文件）
ALTER TABLE agent_presets ADD COLUMN IF NOT EXISTS based_on text;
