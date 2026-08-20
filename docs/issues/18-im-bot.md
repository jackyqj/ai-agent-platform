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

- [ ] IM 机器人应用注册与回调接入（**钉钉优先**，与 SSO 一致；企微/飞书配置化）
- [ ] 控制面桥接：IM 消息 ↔ 用户会话路由（身份绑定、会话映射）
- [ ] 会话连续性：多轮对话上下文保持（复用 `session_id`）
- [ ] 长任务异步回推：任务完成/失败通知（配合 19）
- [ ] 交互约束：指令白名单、敏感操作转 Web 审批（配合 14）

## 验收标准

- [ ] @机器人提问得到真实回答，多轮上下文连贯
- [ ] 权限校验：IM 入口与 Web 同等安全（无绕过）
- [ ] 长任务结束后主动推送结果

## Comments

> 2025-08-19：**钉钉 Stream 模式机器人接入完成（真实凭证实测）**。`apps/control-plane/src/im/`：
> - `dingtalk-stream` 官方 SDK 长连接（自动重连/ack）：`dingtalk-stream.service.ts`，boot 后 `connected=true` 实测在线
> - 入站桥接：`im.service.ts` —— @消息 → staffId→unionId（通讯录接口，失败退化为 `ding:staffId`）→ 身份 upsert（与 Web SSO 同键）→ 关键词 preset 路由（4 场景对齐 D19）→ 任务入队 → 即时「已受理」回执；`conversationType` 审计
> - 出站推送：30s 轮询跟踪任务终态（done/failed/killed）→ 主动推 markdown 结果到原会话（sink 捕获实测：受理→完成两段推送全通）
> - 安全：敏感操作分层守卫（硬性动词拒绝 + 歧义动词咨询语境放行，8/8 单测）；审批类操作引导 Web（配合 14）
> - 管理端点：`GET /api/admin/im/status`（在线/跟踪数）、`POST /api/admin/im/simulate`（不依赖钉钉群的排障入口）
> 遗留：**真实群 @ 验收**（把机器人拉进群实测）、worker 执行质量（DeepSeek 官方，不再等 Qwen）。
