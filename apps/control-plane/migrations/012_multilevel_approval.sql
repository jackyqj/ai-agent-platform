-- 012：多级审批（14 工单收尾）
-- 审批机制从「单级 manager」扩展为「有序审批链」：每个 level 由一个角色（审批人）批，全链通过才入队。
-- agent_presets.approval_chain：编排外的一层管理配置（admin 可设；默认 ['admin']）。
-- approval_requests.chain/current_level：请求快照的审批链与当前待批层级。

ALTER TABLE agent_presets
  ADD COLUMN IF NOT EXISTS approval_chain jsonb;   -- 有序角色名数组；NULL=默认 ['admin']

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS chain jsonb,            -- 本次请求的审批链
  ADD COLUMN IF NOT EXISTS current_level int NOT NULL DEFAULT 0;  -- 当前待批层级（0=链首）
