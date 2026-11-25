-- 市集目录元数据：场景筛选 / 标签 / 头像（不进编排 spec，不编译进 preset YAML）
ALTER TABLE agent_presets
  ADD COLUMN IF NOT EXISTS scene text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS avatar text NOT NULL DEFAULT '✨';

-- 员工收藏（跨设备）；删除 agent 时级联清掉收藏
CREATE TABLE IF NOT EXISTS agent_favorites (
  user_id text NOT NULL,
  agent_id text NOT NULL REFERENCES agent_presets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_favorites_agent ON agent_favorites (agent_id);
