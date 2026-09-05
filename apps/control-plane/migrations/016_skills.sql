-- 016：skill 市场——skills + skill_versions（24 工单）
-- 应用：psql -U adaptix -d control_plane -f 016_skills.sql
-- skills.status（draft|pending|published|archived）为冗余展示，事实源在 skill_versions.status：
--   存在任一 pending 版本 → pending；无 pending 且有已发布版本 → published；否则 draft；下架置 archived。
-- tags 用 text[]；owner_id / department_id 为字符串（与 approval_requests.requester_user_id、users.dept 同约定）。

CREATE TABLE IF NOT EXISTS skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,                 -- dsh skill name（kebab-case，service 校验）
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  owner_id text NOT NULL,
  visibility text NOT NULL DEFAULT 'company', -- company | department（service 校验）
  department_id text,                        -- visibility=department 时必填（部门名）
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',      -- draft | pending | published | archived
  current_version_id uuid,                   -- 最新已发布版本（service 维护，无 FK——避免与 skill_versions 循环引用）
  like_count integer NOT NULL DEFAULT 0,
  dislike_count integer NOT NULL DEFAULT 0,
  score double precision NOT NULL DEFAULT 0, -- Wilson 下限缓存（service 计算）
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skill_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id uuid NOT NULL REFERENCES skills(id),
  version text NOT NULL,                     -- 简化 semver（service 校验，同 skill 内唯一）
  frontmatter jsonb NOT NULL DEFAULT '{}',   -- name/description/扩展字段（导出 SKILL.md 时序列化为 YAML）
  body text NOT NULL DEFAULT '',             -- SKILL.md 正文
  status text NOT NULL DEFAULT 'pending',    -- pending | published | rejected（事实源）
  reviewer_id text,                          -- 审核人
  review_comment text,                       -- 通过/驳回理由
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_id, version)
);

CREATE INDEX IF NOT EXISTS idx_skills_status ON skills (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skills_owner ON skills (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_versions_skill ON skill_versions (skill_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_versions_pending ON skill_versions (skill_id) WHERE status = 'pending';
