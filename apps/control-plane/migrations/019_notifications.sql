-- 019：站内通知（24 工单 Q23）——与 audit_events 分离：本表是用户收件箱
-- 应用：psql -U adaptix -d control_plane -f 019_notifications.sql
-- kind：skill.submitted（→ 审核者）/ skill.reviewed（→ 作者）/ change_request.opened（→ 作者）/ change_request.handled（→ 提交人）

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',   -- 上下文（skill_id / version / 相关人 等）
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;
