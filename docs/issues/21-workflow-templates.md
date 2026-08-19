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

> 2025-08-19：**工作流能力就绪 + 模板库完成**。
> - **运行时装配**：worker.cordis.yml 挂载 DSH 原生子代理+工作流全套（subagent/spawn/fork providers、tool-subagent/control/report、workflow-worker-thread、tool-workflow、timeout-policy），boot 验证通过；会话上下文确认工具已注册（workflow/subagent/subagent_fork/send_message/list_agents/interrupt_agent）
> - **模板库**：templates/workflows/ 3 个高频模板（周报汇总/多源报表/跨源收集），每份含触发语、workflow 脚本建议（parallel/pipeline 用法）、输出要求
> - **管线验证**：任务入队→worker 执行→多轮对话链路通
> - ⚠️ **执行时长受限（模型拖累）**：演示任务 8+ 分钟未完成（NVIDIA 慢模型 × 多轮 + 子代理扇出）；与工具调用可靠性问题同源——**私有 Qwen 接入后回归完整验证**（这正是 Qwen 回归的又一论据）
> 遗留：Qwen 回归后的完整端到端验证（含真实扇出证据）；模板与 preset/定时任务的引用接线（taskTemplate 指向模板）；执行结果推送（18）。
