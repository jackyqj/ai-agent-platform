-- 18 续：平台钉钉入口 1:N 绑定 + conversation→D22 会话映射
-- 不自动创建钉钉应用；单 Stream 机器人由运维配置，门户只开通/关闭入口。

-- Agent ↔ 平台钉钉入口（1:N）
CREATE TABLE IF NOT EXISTS im_agent_bindings (
  preset_id   text PRIMARY KEY REFERENCES agent_presets(id) ON DELETE CASCADE,
  enabled     boolean NOT NULL DEFAULT true,
  keywords    jsonb NOT NULL DEFAULT '[]',
  priority    int NOT NULL DEFAULT 0,
  -- 预留 1:1：本期恒为 NULL；非空时表示该绑定只服务指定 robotCode
  robot_code  text NULL,
  enabled_by  text,
  enabled_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS im_agent_bindings_enabled_prio
  ON im_agent_bindings (enabled, priority DESC) WHERE enabled;

-- 钉钉会话 → D22 逻辑会话（群聊多人共享 conversationId，必须带 user_id）
CREATE TABLE IF NOT EXISTS im_conversations (
  conversation_id text NOT NULL,
  user_id         text NOT NULL REFERENCES users(id),
  preset_id       text NOT NULL REFERENCES agent_presets(id),
  session_id      uuid NOT NULL REFERENCES sessions(id),
  conv_type       text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS im_conversations_session ON im_conversations (session_id);
