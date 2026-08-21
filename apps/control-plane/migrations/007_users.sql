-- 13 leftover：控制面用户持久化（字符串 id 与 D12 部门名；角色覆盖不丢）
ALTER TABLE users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE users ALTER COLUMN id TYPE text USING id::text;

ALTER TABLE users ADD COLUMN IF NOT EXISTS dept text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_override text;

CREATE INDEX IF NOT EXISTS idx_users_external ON users (external_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
