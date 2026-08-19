-- 005：定时 Agent（20 工单）
-- 应用：psql -U adaptix -d control_plane -f 005_scheduled_tasks.sql

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id text NOT NULL,                 -- 创建者（配额/授权按 owner 计）
  name text NOT NULL,
  agent_preset_id text NOT NULL DEFAULT 'assistant',
  schedule text NOT NULL,                      -- 'daily HH:MM' | 'every <N>m' | 'every <N>h'
  task_template text NOT NULL,                 -- 定时任务内容模板（发往队列）
  status text NOT NULL DEFAULT 'active',       -- active | paused
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sched_next ON scheduled_tasks (status, next_run_at);
