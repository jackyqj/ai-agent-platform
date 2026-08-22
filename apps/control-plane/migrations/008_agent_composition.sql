-- 12 Agent 编排（agent-orchestration-design.md §7）：工作副本 + 已发布修订
-- composition 是编排工作副本（编辑器所见，未发布的改动也在这里）；
-- agent_preset_revisions 是已发布真源（每次 publish 追加一行，version 单调 +1）。

ALTER TABLE agent_presets
  ADD COLUMN IF NOT EXISTS composition JSONB,
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS agent_preset_revisions (
  preset_id     TEXT NOT NULL REFERENCES agent_presets(id),
  version       INTEGER NOT NULL,
  spec          JSONB NOT NULL,          -- 该次发布的 AgentSpec
  compiled_yaml TEXT NOT NULL,           -- 当时 serialize 的产物（审计 / 对照漂移）
  compiled_meta TEXT NOT NULL,
  published_by  TEXT NOT NULL,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (preset_id, version)
);

CREATE INDEX IF NOT EXISTS idx_agent_revisions_preset ON agent_preset_revisions (preset_id, version DESC);
