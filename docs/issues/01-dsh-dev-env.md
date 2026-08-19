# 01 DSH 开发环境搭建

Status: open
Type: task
Phase: Phase 0 — 地基与试点（第 1–2 周）
Blocked by: —

## 背景

Phase 0 的第一步（spec §5 Phase 0）。DSH 处于 pre-release（rc.5/rc.6），需先在本机与开发服务器各建一套可运行、可复现的环境，作为后续一切工作的基础。

## 目标

搭建 DSH 源码开发环境 + 本地 web profile 跑通，并验证版本锁定策略。

## 交付物

- [ ] 基于 `dsh-source/`（rc.5 克隆）完成 `pnpm install` + `pnpm build`，本地 `dsh web` 可启动
- [ ] 与 npm 安装版（rc.6）对照：确认两者差异，决定开发基线锁定哪个版本
- [ ] `dsh --profile web --dump-config` 导出组合树，确认 profile/bundle/patch 分层可观测
- [ ] 验证 headless 模式与 Python SDK（`deepseek-harness-sdk`）可运行同一任务
- [ ] 记录环境搭建步骤到仓库文档（团队新成员可复现）

## 验收标准

- [ ] 新机器按文档 30 分钟内跑起 `dsh web`
- [ ] 同一任务在 web / headless / Python SDK 三入口结果一致
- [ ] 版本基线确定并写入 `map.md`（D7 内核边界策略的落地依据）

## Comments

> 2025-08-16：**完成**。`pnpm install`(41.5s) + `pnpm run build` 成功；web 冒烟 HTTP 200；headless 启动（缺模型 key 属预期）；MCP 挂载验证通过（成功拉起 company-mcp-kb 子进程）。环境事实与可复现步骤见 `phase0/01-dev-env/setup.md`。遗留：模型密钥申请（人类步骤）。
>
> 2025-08-18：**模型端点解锁**。NVIDIA OpenAI 兼容端点（`DEEPSEEK_BASE_URL` + `DEEPSEEK_API_KEY`，模型 `deepseek-ai/deepseek-v4-flash-0731`）接入，headless 全链路（模型+工具调用）跑通。⚠️ 该 key 为测试用途，生产密钥必须走 D20 密钥服务，测试后建议轮换。
