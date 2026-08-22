-- 010：定时 Agent 补强（20 工单收尾）
-- 1) scheduled_tasks 增时区与最近一次运行结果列（previous 遗留：时区=服务器本地；无失败可见性）
-- 2) scheduled_run_logs 记录每次触发的运行日志，支撑「执行失败告警」与任务历史

ALTER TABLE scheduled_tasks
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_status TEXT;   -- fired | failed

CREATE TABLE IF NOT EXISTS scheduled_run_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_id uuid NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
  task_id      uuid,
  status       text NOT NULL,                      -- fired | failed
  error        text,
  run_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sched_run_sched ON scheduled_run_logs (scheduled_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_sched_run_status ON scheduled_run_logs (status, run_at DESC);
