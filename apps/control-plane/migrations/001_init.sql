-- 控制面数据模型 v1（enterprise-shell §4 落地）
-- 应用：psql -U adaptix -d control_plane -f 001_init.sql
-- 注：会话事件（session_events）属 08 工单（DSH SessionPersistence 后端），本迁移只含平台元数据

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  name text NOT NULL,
  parent_id uuid REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  idp text NOT NULL DEFAULT 'dingtalk',
  name text NOT NULL,
  dept_id uuid REFERENCES departments(id),
  role text NOT NULL DEFAULT 'employee',          -- employee | developer | admin
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,                              -- 控制面用户 id（内存阶段为字符串；PG 用户表落地后可为 uuid）
  agent_preset_id text NOT NULL DEFAULT 'assistant',
  type text NOT NULL DEFAULT 'web',               -- web | rpc
  instance_id uuid,
  routing_secret text NOT NULL,                   -- 实例代理校验（shell §3.3）
  status text NOT NULL DEFAULT 'active',          -- active | idle | closed
  created_at timestamptz DEFAULT now(),
  last_active_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'web',               -- web | rpc
  user_id text,                                   -- 控制面用户 id（同 sessions）
  host text NOT NULL,
  port int NOT NULL,
  status text NOT NULL DEFAULT 'spawning',        -- spawning|ready|busy|idle|reaping|dead
  container_id text,
  spawn_at timestamptz DEFAULT now(),
  last_heartbeat timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  user_id text,                              -- 控制面用户 id（内存阶段为字符串；PG 用户表落地后可为 uuid）
  session_id text,                           -- 同上
  event_type text NOT NULL,                  -- auth.login|session.create|admin.*|proxy.*
  payload jsonb,
  ts timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_user_ts ON audit_events (user_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_type_ts ON audit_events (event_type, ts DESC);

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,                  -- sha256，明文只展示一次
  scopes text[] NOT NULL DEFAULT '{}',            -- {task:create}
  owner_dept uuid REFERENCES departments(id),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz
);

CREATE TABLE IF NOT EXISTS agent_presets (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  visibility jsonb NOT NULL DEFAULT '{}',         -- {departments:[], roles:[]}
  model_route jsonb,                              -- {provider, model, pinned:bool}
  approval_level text NOT NULL DEFAULT 'none',
  status text NOT NULL DEFAULT 'published',       -- draft|published|deprecated
  version int NOT NULL DEFAULT 1
);
