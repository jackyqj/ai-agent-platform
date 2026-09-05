-- 018：skill 市场——change_requests（逐句改稿工单，24 工单）
-- 应用：psql -U adaptix -d control_plane -f 018_change_requests.sql
-- 锚定已发布版本：anchor = {line_no, original_text}；新版本发布不使旧建议失效（挂旧版本可追溯）。
-- 状态机：open → adopted / rejected / replied；「随 vX 已处理」记录在 resolved_version。

CREATE TABLE IF NOT EXISTS change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id uuid NOT NULL REFERENCES skills(id),
  version_id uuid NOT NULL REFERENCES skill_versions(id), -- 锚定版本（已发布）
  anchor jsonb NOT NULL,                            -- {line_no, original_text}
  suggested_text text NOT NULL,
  reason text NOT NULL DEFAULT '',
  requester_id text NOT NULL,
  status text NOT NULL DEFAULT 'open',              -- open | adopted | rejected | replied
  handler_id text,                                  -- 处理人（作者/审核者/admin）
  reply text,                                       -- 处理回复
  resolved_version text,                            -- 「随 vX 已处理」标记（版本号）
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_requests_skill ON change_requests (skill_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_requests_requester ON change_requests (requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_requests_open ON change_requests (status, created_at DESC);
