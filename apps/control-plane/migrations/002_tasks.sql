-- 002：任务表（19 工单）——自动化任务队列的持久化侧
-- 应用：psql -U adaptix -d control_plane -f 002_tasks.sql

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,                                 -- 触发者（服务身份 keyId 或控制面用户 id）
  agent_preset_id text NOT NULL DEFAULT 'assistant',
  payload jsonb NOT NULL,                       -- 任务内容（模型提示词等）
  status text NOT NULL DEFAULT 'queued',        -- queued|running|done|failed|killed
  result jsonb,                                 -- 完成结果（final_response + 事件摘要）
  error text,                                   -- 失败原因
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks (user_id, created_at DESC);
