-- 020：skill 草稿工作副本（24 工单）——提交审核前正文不进 skill_versions
-- 应用：psql -U adaptix -d control_plane -f 020_skill_draft.sql

ALTER TABLE skills ADD COLUMN IF NOT EXISTS draft_frontmatter jsonb NOT NULL DEFAULT '{}';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS draft_body text NOT NULL DEFAULT '';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS draft_version text NOT NULL DEFAULT '0.1.0';
