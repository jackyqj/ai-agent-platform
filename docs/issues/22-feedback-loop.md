# 22 反馈闭环与效果评估

Status: open
Type: task
Phase: Phase 3 — 知识库与自动化（第 11–14 周）
Blocked by: 15

## 背景

spec §1.3 成功标准「平台可观测、可改进」；§5 Phase 3「反馈闭环：会话反馈收集、效果评估、prompt 迭代」。DSH 原生有 `dsh-message-feedback`/`dsh-command-feedback`（会话内反馈）与 `dsh-session-telemetry` 的 FEEDBACK_ONLY 模式，平台层需要把反馈汇总成可迭代的评估数据。

## 目标

建立「使用 → 反馈 → 评估 → 迭代」闭环：每会话可评分，聚合出 Agent 效果画像，驱动 prompt/工作流迭代。

## 交付物

- [ ] 反馈收集：会话内 👍/👎 + 文本反馈（Web 与 IM 入口）
- [ ] 反馈聚合看板：按 Agent/场景/部门的满意度与失败率（配合 15 数据）
- [ ] 效果评估：抽样人工评估 + 关键场景基准集（golden set）
- [ ] 迭代机制：评估结果 → preset/prompt 变更 → 回归验证
- [ ] 「检索不到/答错」的闭环路由（RAG 反馈进 17 的优化队列）

## 验收标准

- [ ] 反馈率 ≥10% 活跃会话（目标值，试点期校准）
- [ ] 关键场景基准集回归通过率持续上升或保持
- [ ] 每轮迭代有数据支撑的改进记录

## Comments
