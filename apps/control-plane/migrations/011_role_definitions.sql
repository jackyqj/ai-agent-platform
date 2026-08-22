-- 011：自定义角色（13 工单收尾）：在预置 employee/developer/admin 之外支持自定义角色
-- 每个角色 = 名称 + 权限点集合（jsonb）+ 对应的 DSH 沙箱 preset。
-- 预置角色的权限集仍由代码内 PERMISSIONS 矩阵决定；本表只承载「自定义」角色。
-- 用户 role 字段可引用本表名称（admin 管理后台指派）。

CREATE TABLE IF NOT EXISTS role_definitions (
  name        text PRIMARY KEY,               -- 自定义角色名（如 report-viewer / hr-operator）
  permissions jsonb NOT NULL DEFAULT '[]',    -- Permission[]（权限点集合）
  dsh_preset  text NOT NULL DEFAULT 'workspace-write',  -- read-only | workspace-write | danger-full-access
  updated_at  timestamptz NOT NULL DEFAULT now()
);
