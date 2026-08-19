# 02 公司级 profile 与 persona

Status: open
Type: task
Phase: Phase 0 — 地基与试点（第 1–2 周）
Blocked by: 01

## 背景

spec §5 Phase 0「公司级 profile：统一 persona、中文提示词基座、内网模型网关端点」。DSH 的 profile/bundle/patch 分层允许公司层配置覆盖产品默认（patch 按行 id 整体替换 config，无深合并——见 research-report §1）。

## 目标

产出公司统一的 profile 基线：所有员工会话共享的公司 persona、中文基座提示词、默认模型路由、基础工具集。

## 交付物

- [ ] 公司 profile 目录（`cordis.patch.yml` + bundle 声明），覆盖 persona 与默认模型
- [ ] 中文系统提示词基座（公司背景、语气规范、工具使用守则、保密红线）
- [ ] 默认工具集裁剪：普通员工默认不挂危险工具（对照 permission-presets）
- [ ] 敏感/普通 Agent 的默认模型路由占位（待 03 网关就绪后启用）
- [ ] 公司 profile 的 `--dump-config` 组合树存入文档供审计

## 验收标准

- [ ] 新会话默认加载公司 persona，对话风格符合规范
- [ ] 普通员工 profile 下危险工具不可见/不可用
- [ ] profile 变更可热加载（HMR）且可回滚

## Comments

> 2025-08-16：**骨架完成**。公司 profile（persona/模型路由/presets 根/MCP 行）见 `phase0/02-company-profile/`；`--dump-config` 验证组合正确（persona 覆盖、agent-presets 覆盖、bundles 分层）。遗留：网关路由切换（等 03）、presets 实际目录内容（Phase 2）、危险工具收敛策略（Phase 2 配合 13）。
