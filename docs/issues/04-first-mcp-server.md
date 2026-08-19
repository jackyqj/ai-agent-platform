# 04 首个内部 MCP Server 接入

Status: open
Type: task
Phase: Phase 0 — 地基与试点（第 1–2 周）
Blocked by: 01

## 背景

spec ADR-4 与 §2.1：DSH 无内置 RAG/外部系统能力，MCP 是官方支持的外部能力通道（`dsh-mcp-client`，仅 stdio/streamable-http 两种传输）。本工单先跑通「内部服务 → MCP → DSH 工具」的完整链路，为 17（RAG）与后续数据库/内部 API 连接器打样。

## 目标

第一个内部 MCP Server 上线并被 DSH Agent 实际调用。已定 D19/D17：首批知识库 = 公司制度文档 + FAQ（本工单的检索工具即为 17 的 RAG 打样）。

## 交付物

- [ ] 内部 MCP Server 骨架（streamable-http 传输）+ 首个工具
- [ ] `dsh-mcp-client` 配置接入（cordis.yml，含鉴权 header）
- [ ] 端到端验证：Agent 通过 `mcp__<server>__<tool>` 调用成功
- [ ] MCP Server 开发/部署/注册的内部规范文档（供 17 与后续连接器复用）
- [ ] 断连/重连行为验证（reconnect 策略）

## 验收标准

- [ ] 自然语言提问能触发 Agent 调用 MCP 工具并返回真实结果
- [ ] 工具名按 `mcp__<serverName>__<rawName>` 注册，无冲突
- [ ] MCP Server 崩溃后自动重连恢复，工具不重复注册

## Comments

> 2025-08-16：**代码完成，链路验证通过**。`phase0/04-mcp-server/`（Node/TS + MCP SDK 1.30.0）：SDK 客户端全过（tools/list + 检索 + 无命中兜底）；DSH headless 挂载验证——成功拉起子进程（stdio），失败点确认缺模型 key 而非 MCP 链路。**已知问题**：SDK streamable-http 路径在 Node 26 下响应挂起（stdio 正常），Phase 0 用 stdio，服务化前需升级 SDK/锁 Node LTS（详见 04 README）。遗留：验收标准 1（自然语言触发调用）需模型 key。
