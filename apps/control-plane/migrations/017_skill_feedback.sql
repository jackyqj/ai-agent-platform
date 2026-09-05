-- 017：skill 市场——skill_feedback（赞/踩，24 工单）
-- 应用：psql -U adaptix -d control_plane -f 017_skill_feedback.sql
-- 每用户对每 skill 一票（unique(skill_id, user_id)），改票 = 更新本行 kind/version_id/updated_at。

CREATE TABLE IF NOT EXISTS skill_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id uuid NOT NULL REFERENCES skills(id),
  version_id uuid REFERENCES skill_versions(id), -- 反馈当时的版本上下文（可空）
  user_id text NOT NULL,
  kind text NOT NULL,                            -- like | dislike（service 校验）
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_feedback_skill ON skill_feedback (skill_id);
