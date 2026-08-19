# 12 Agent 商店（presets 目录服务）

Status: open
Type: task
Phase: Phase 2 — Agent 目录与治理（第 7–10 周）
Blocked by: 06, 07

## 背景

spec ADR-6：Agent 类型 = DSH preset（`agent.cordis.yml` 目录组合），`dsh-agent-presets` 开箱即用且列表实时重读；平台控制面维护「Agent 商店」：上架/下架、可见部门、默认模型路由、配额、审批级别。这是把「工具」变成「产品」的核心。目录服务设计见 enterprise-shell §3.5（`agent_presets` 表 + 只读目录下发 + 会话创建时 pin 版本）。

## 目标

员工在 Web 门户看到「Agent 商店」，按需选用已上架 Agent（如：客服助手、数据分析师、周报助手），管理员可上架/下架。

## 交付物

- [ ] 首批 4 个 Agent preset（已定 D19 场景：制度/HR 问答、报销/财务流程、数据查询报表、研发文档检索）
- [ ] Agent 商店 API：列表（按可见性过滤）、选用、详情
- [ ] 上架/下架工作流：管理员审核、版本管理（复制即作者写入口，见 `agentPresets.copy`）
- [ ] 可见性控制：按部门/角色（配合 13）
- [ ] 每 Agent 配置：默认模型路由（私有/云端）、审批级别、配额档（配合 14/16）
- [ ] 员工自建 preset 的提审流程（写权限收敛到管理员）

## 验收标准

- [ ] 普通员工只能看到本部门可见的 Agent，选用即开新会话
- [ ] 管理员上架后立即可见，下架后新会话不可选（存量会话不受影响）
- [ ] M2 里程碑：管理后台可完成 Agent 上架/下架

## Comments

> 2025-08-18（续）：**提审流程 + 商店 UI 完成**。
> - 员工提审：`POST /api/agents/propose`（id 校验/不冲突/基于模板）→ draft；admin 批准 `POST /api/admin/agents/:id/approve` → **preset 文件生成**（复制模板 agent.cordis.yml + 写新 preset.yml）→ 上架；拒绝保持 draft
> - 实测：员工提审 doc-assistant → draft 不可见 → 批准 → 文件落盘 $DSH_HOME/presets-company/doc-assistant/ → 员工可见（5 个）
> - 商店 UI：`phase2/agent-store/ui/index.html`（纯静态无构建）——登录/商店网格/选用（返回 session+routingSecret）/提审表单/admin 审批与上下架；控制面已开 CORS
> - 运行指引：`RUN-LOCALLY.md`

> 2025-08-18：**商店 v1 核心完成并实测**。
> - **preset 内容**：`phase2/agent-store/presets/` 4 个真实 preset（assistant/hr-assistant/report-builder/doc-search，对应 D19 场景），
>   `dsh-agent-presets` 发现验证通过（Loader+Include 装配，全部无 broken、可解析）；已同步 `$DSH_HOME/presets-company/`
> - **目录服务**：`agent_presets` 落 PG（4 行，模型路由/审批级别/版本正确）+ 员工列表/详情 API + 管理上架/下架/可见性 API
> - **实测**：员工列表隐藏 report-builder（roles 过滤 3/4）；详情可见性修复（隐藏 Agent 员工 GET → 404）；
>   上架/下架往返 deprecated ↔ published 即时生效；developer 见全量 4 个
> - report-builder 模型路由钉死 private/qwen-72b（D18）；persona 内置「必须先 list_tables、禁止编造工具输出」
> 遗留：员工自建提审流程、配额档（16）、敏感工具审批钩子（14）、前端商店 UI、preset 内容版本联动。
