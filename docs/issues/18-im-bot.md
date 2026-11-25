# 18 IM 机器人接入（企微/钉钉/飞书）

Status: open
Type: task
Phase: Phase 3 — 知识库与自动化（第 11–14 周）
Blocked by: 06, 07

## 背景

spec §3.2 典型交互：员工在**钉钉** @机器人 → 机器人回调控制面 → 鉴权 → 路由到该员工的会话 → Agent 执行 → 结果推送。IM 入口是把 Agent 延伸到员工日常工具的关键（research-report §7 差距：无 IM 入口，需控制面桥接）。首发与 SSO 一致选**钉钉**。

## 目标

员工在 IM 里直接与平台 Agent 对话/触发任务，结果异步回推。

## 交付物

- [x] IM 机器人应用注册与回调接入（**钉钉优先**，与 SSO 一致；企微/飞书配置化）
- [x] 控制面桥接：IM 消息 ↔ 用户会话路由（身份绑定、会话映射）
- [x] 会话连续性：多轮对话上下文保持（复用 `session_id`；`im_conversations`：conversationId+userId → D22 session）
- [x] 长任务异步回推：任务完成/失败通知（配合 19）
- [x] 交互约束：指令白名单、敏感操作转 Web 审批（配合 14）
- [x] 门户「开通钉钉入口」：已发布 Agent → `im_agent_bindings`（1:N 挂到平台单机器人；不自动创建钉钉应用）

## 验收标准

- [ ] @机器人提问得到真实回答，多轮上下文连贯（**真实群 @ 仍待验收**；simulate + 单测已覆盖 conversation→session）
- [x] 权限校验：IM 入口与 Web 同等安全（无绕过）
- [x] 长任务结束后主动推送结果

## Comments

> 2025-08-19：**钉钉 Stream 模式机器人接入完成（真实凭证实测）**。`apps/control-plane/src/im/`：
> - `dingtalk-stream` 官方 SDK 长连接（自动重连/ack）：`dingtalk-stream.service.ts`，boot 后 `connected=true` 实测在线
> - 入站桥接：`im.service.ts` —— @消息 → staffId→unionId → 身份 upsert → 任务入队 → 即时回执
> - 出站推送：30s 轮询跟踪任务终态 → sessionWebhook 推 markdown
> - 安全：敏感操作分层守卫；审批类引导 Web
> 遗留：**真实群 @ 验收**。

> 2026-11-25：**开通钉钉入口（1:N）+ IM 多轮**：
> - 迁移 `022_im_agent_bindings.sql`：`im_agent_bindings`（keywords/priority；`robot_code` 预留 1:1）+ `im_conversations`
> - 路由改绑定表（替代硬编码场景关键词）；「切换 Agent」新建 session；同 conversation 复用 D22 session
> - API：`POST/DELETE/GET /admin/agents/:id/im`；`GET /admin/im/bindings`；status 含 `bindingsCount`；simulate 可带 `conversationId`
> - 门户 Agent 管理：「开通钉钉入口 / 关闭 / 更新」+ Stream 状态提示
> - 下架 Agent 自动关闭入口
> 仍待：真实群 @ 验收；远期 1:1 专用机器人 / 钉钉 AI 助理渠道。
