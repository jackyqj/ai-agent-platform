# 公司 AI Agent 平台（ai-agent-platform）

公司内部 AI Agent 使用平台——基于 DeepSeek Harness（DSH）扩展，50–500 人试点 → 推广。

## 仓库结构

| 路径 | 内容 |
|---|---|
| `apps/control-plane/` | 控制面（NestJS）：认证/会话/实例编排/商店/审批/配额/审计/任务入口 |
| `services/mcp-kb/` | 知识库 MCP Server（RAG 语义检索 + 关键词回退） |
| `services/mcp-db/` | 只读数据库 MCP Server（SELECT-only + 白名单） |
| `presets/` | Agent 商店 preset 源（assistant/hr-assistant/report-builder/doc-search） |
| `web/store/` | 商店 + 管理静态 UI（无构建，浏览器打开） |
| `configs/` | 公司 profile、LiteLLM 网关配置、persona |
| `apps/control-plane/migrations/` | PostgreSQL 迁移（001 元数据 / 002 任务 / 003 审批 / 004 配额） |
| `docs/` | 架构（spec/enterprise-shell）、调研、工单（issues/）、运行指引（RUN-LOCALLY.md）、状态（STATUS.md） |
| `infra/` | 基础设施 compose（PG/Redis/OTel） |
| `deps/README.md` | **DSH 耦合组件**的链接说明（重要） |

## 与 DSH 工作区的关系（关键）

平台分两层：

- **独立组件**（本仓库管理）：控制面、MCP Servers、presets、UI、配置、文档、迁移
- **DSH 耦合组件**（见 `deps/README.md`，物理位于 DSH 工作区）：任务 Worker、PG 会话持久化 Provider——
  它们依赖 DSH workspace 的 `@deepseek-ai/*` 包与共享测试契约，必须随 DSH 源码工作区构建运行

DSH 工作区位于 `/Users/jac/sw_dir/dsh/dsh-source/`；`dsh-source/packages/platform/` 与
`dsh-source/packages/session/session-persistence-pg/` 为平台自有（工作区托管），详见 deps 说明。

## 快速开始

见 `docs/RUN-LOCALLY.md`（控制面 → Worker → UI → 演示流程）。

## 状态

见 `docs/STATUS.md`（23 张工单进度 + 待真人/外部清单）与 `docs/map.md`（决策 D1–D21）。
