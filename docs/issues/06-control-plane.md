# 06 控制面骨架（实例编排）

Status: open
Type: task
Phase: Phase 1 — 多用户与身份（第 3–6 周）
Blocked by: 01

## 背景

spec ADR-1/ADR-2：多用户模型 = 每用户 DSH Web 实例（懒启动 + 空闲回收）+ JSON-RPC 运行时池；控制面是平台最重的自建件，负责用户/会话/实例编排、路由、配额校验与审计落库。本工单只做骨架，业务面（管理后台、Agent 商店）后续工单扩展。设计详见 enterprise-shell §3.2–3.4（控制面 API/会话路由/实例编排）与 §4 数据模型、§7 接口契约；技术栈已定：**Node/TS + NestJS（Fastify）**，容器 **Docker 起步**（编排接口抽象预留 K8s）。

## 目标

控制面服务上线：能注册用户、按需拉起/回收 DSH 实例、路由请求、记录审计事件。

## 交付物

- [ ] 控制面服务骨架（Node/TS + NestJS(Fastify)，Docker 部署，见 enterprise-shell §3.2）
- [ ] 用户模型与数据表（用户/部门/会话/实例，shell §4：`users`/`departments`/`sessions`/`instances`，预留 RBAC 扩展）
- [ ] 实例编排：容器化 DSH Web 实例懒启动、空闲回收、健康检查、并发上限（状态机见 shell §3.4）
- [ ] 请求路由：登录用户 → 其实例（实例地址不暴露给客户端；每会话 `routing_secret` + JWT + 会话归属三重校验，shell §3.3/§6）
- [ ] 审计事件落库（谁/何时/调了哪个实例/会话，shell §3.8 `audit_events`）
- [ ] JSON-RPC 运行时池预留接口（19 落地）

## 验收标准

- [ ] 50 并发用户模拟下实例按预算拉取/回收，无资源泄漏
- [ ] 实例故障自动重启，用户会话可迁移恢复（配合 08）
- [ ] 每次实例生命周期事件可审计查询

## Comments

> 2025-08-16：**骨架完成并全链路实测**。`phase1/control-plane/`（NestJS+Fastify，31 文件）：
> - 会话/实例模块 + 编排器接口（memory 回退 / **container 实现已用 podman 真机验证**：懒启动容器、健康检查置 ready、关闭会话销毁容器零残留）
> - 代理三重校验实测：错误 routing_secret → 403、他人会话 → 403、正确 → 200 透传（状态码+content-type）
> - 审计落 **PostgreSQL**（login/create/forward/denied/close 全量，fail-soft 回退内存）
> - PG 迁移 001_init.sql（7 表）已在 control_plane 库执行
> - 踩坑记录：Node 26 正则 `$` 不匹配末尾换行前（先 trim 再匹配）；Fastify 通配路由 req.url 结构
> 遗留：sessions/instances 落 PG（与 08 合并设计）、代理补 POST/WebSocket 升级、真实 dsh-web 镜像。
