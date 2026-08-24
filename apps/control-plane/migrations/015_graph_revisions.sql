-- 图修订历史（图编排 P3）：每次 publish 追加一行；rollback = 把旧 spec 写回工作副本再 publish。

CREATE TABLE IF NOT EXISTS graph_revisions (
  graph_id      TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  visibility    JSONB NOT NULL DEFAULT '{}',
  spec          JSONB NOT NULL,
  published_by  TEXT NOT NULL,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (graph_id, version)
);

CREATE INDEX IF NOT EXISTS idx_graph_revisions_graph ON graph_revisions (graph_id, version DESC);
