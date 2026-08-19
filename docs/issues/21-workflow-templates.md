# 21 复杂工作流模板（子代理编排）

Status: open
Type: task
Phase: Phase 3 — 知识库与自动化（第 11–14 周）
Blocked by: 06, 12

## 背景

spec §5 Phase 3「复杂工作流：子代理编排模板（报表生成、周报汇总等高频场景）」。DSH 原生 `dsh-workflow`（模型编写 JS 编排脚本，fan-out 子代理：parallel/pipeline/phase/log）+ `dsh-subagent`（in-process/fork/外部 provider，可续聊）可直接复用（research-report §6）。

## 目标

高频复杂任务沉淀为可复用工作流模板：多步骤、可并行、可观测。

## 交付物

- [ ] 工作流模板框架：模板 → 参数化执行（基于 `dsh-workflow`）
- [ ] 首批 2–3 个工作流模板（对应 05 场景清单中的复杂场景）
- [ ] 子代理编排模式沉淀：并行收集 → 汇总（周报类）
- [ ] 工作流执行可视化（进度/阶段/子代理状态，DSH web 已有 workflow-run UI 基础）
- [ ] 失败处理：子代理失败降级、人工介入点

## 验收标准

- [ ] 复杂任务一键触发，全程可观测，产出与人工基线相当
- [ ] 模板参数化：同一模板不同输入可复用
- [ ] ≥1 个模板被业务方实际投入使用

## Comments
