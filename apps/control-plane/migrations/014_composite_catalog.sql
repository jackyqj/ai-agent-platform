-- Option A：连接器 / 工具 / 管理员发布的组合图
-- 密钥只存 secret_ref（D20 vault），本表不含明文。

CREATE TABLE IF NOT EXISTS connectors (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft',
  secret_ref  TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}',
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_tools (
  id            TEXT PRIMARY KEY,
  connector_id  TEXT NOT NULL REFERENCES connectors(id),
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  risk          TEXT NOT NULL DEFAULT 'read',
  status        TEXT NOT NULL DEFAULT 'draft',
  binding       JSONB NOT NULL,
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS graphs (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'draft',
  visibility      JSONB NOT NULL DEFAULT '{}',
  spec            JSONB NOT NULL,
  published_spec  JSONB,
  version         INTEGER NOT NULL DEFAULT 1,
  updated_by      TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS graph_runs (
  id          TEXT PRIMARY KEY,
  graph_id    TEXT NOT NULL REFERENCES graphs(id),
  user_id     TEXT NOT NULL,
  status      TEXT NOT NULL,
  input       JSONB NOT NULL,
  steps       JSONB NOT NULL DEFAULT '[]',
  result      TEXT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_graph_runs_user ON graph_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_graph_runs_graph ON graph_runs (graph_id, created_at DESC);
