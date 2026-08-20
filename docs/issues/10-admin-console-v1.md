# 10 管理后台 v1

Status: open
Type: task
Phase: Phase 1 — 多用户与身份（第 3–6 周）
Blocked by: 06, 07

## 背景

spec §5 Phase 1「管理后台 v1：用户、实例、模型配置、会话列表」。DSH 原生的 settings/模型配置页面向单用户，平台级管理面需自建（research-report §7 差距 #3：无管理控制台/RBAC）。管理后台设计见 enterprise-shell §3.10 与 §7 管理端点。

## 目标

管理员可完成：用户管理、实例状态查看、模型配置、会话列表与审计查看。

## 交付物

- [x] 管理后台前端（可并入 Web 门户或独立路由）
- [x] 用户管理：列表、启用/禁用、部门、角色（配合 07）
- [x] 实例监控：运行中实例、资源占用、回收操作
- [x] 模型配置：默认模型、可用模型开关、私有/云端路由展示（读 03 网关）
- [x] 会话列表：按用户/部门/时间检索，可查看事件摘要
- [x] 审计查询入口 v1（完整看板见 15）

## 验收标准

- [x] 管理员 3 步内找到任一用户的任一会话
- [x] 禁用一个用户后其实例立即回收、新请求被拒
- [x] 管理操作本身留痕

## Comments

> 2026-08-20：v1 落地为静态页 `web/store/admin.html`（与商店同仓、无构建），控制面补齐缺口 API：`POST /api/admin/users/:id`（禁用即 `closeAll`+`stopForUser`，JWT 后续 401）、`GET /api/admin/sessions`（不含 routing_secret）、`POST /api/admin/instances/:id/stop` 与 `reap`、`GET /api/admin/models`（只读；03 网关未部署故无写开关）。审计支持 `sessionId`。找会话路径：登录 → 用户「会话」→ 点会话行看事件。
