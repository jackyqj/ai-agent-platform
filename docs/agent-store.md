# Agent 商店 v1（12 工单）

## 双轨结构

| 轨 | 内容 | 位置 |
|---|---|---|
| **preset 内容**（DSH 侧） | 4 个真实 preset 目录（`agent.cordis.yml` + `preset.yml`），dsh-agent-presets 发现/解析 | `phase2/agent-store/presets/` → 同步到 `$DSH_HOME/presets-company/` |
| **目录元数据**（控制面侧） | `agent_presets` 表（PG）+ 员工/管理 API | `phase1/control-plane/src/agents/` |

## 首批 4 个 preset（D19 场景）

| id | 名称 | 场景 | 模型路由 | 审批 |
|---|---|---|---|---|
| assistant | 通用助手 | 试点底座 | 云端 deepseek-v4-flash | none |
| hr-assistant | HR 制度助手 | 制度/HR 问答 | 云端 | none |
| report-builder | 数据报表助手 | 数据查询报表 | **钉死 private/qwen-72b**（D18 数据敏感） | self |
| doc-search | 研发文档检索 | 研发文档检索 | 云端 | none |

report-builder 的 persona 内置上轮模型行为教训：必须先调 list_tables、禁止编造工具输出。

## 验证（2025-08-18）

- [x] `dsh-agent-presets` 发现：4 个 preset 全部发现、无 broken、可解析（Loader+Include 装配）
- [x] 员工列表：report-builder 按 roles=[developer,admin] 对员工隐藏（3/4）
- [x] 详情可见性：隐藏 Agent 员工 GET → 404（修复过：详情原未过滤可见性）
- [x] 上架/下架往返：deprecated ↔ published 即时生效
- [x] PG 落库：4 行，模型路由/审批级别/版本正确

## 遗留（Phase 2 后续）

- 员工自建 preset 提审流程（`agentPresets.copy` 作者位 + 审核 → 12 工单）
- 每 Agent 配额档（配合 16）、敏感工具审批钩子（配合 14）
- 前端商店 UI（Agent 卡片/选用入口）
- preset 版本管理（内容变更 → 目录替换 + 目录表 version 递增联动）
