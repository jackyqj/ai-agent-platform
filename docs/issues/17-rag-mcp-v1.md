# 17 RAG MCP Server v1（知识库 + 权限过滤）

Status: done
Type: task
Phase: Phase 2 — Agent 目录与治理（第 7–10 周）
Blocked by: 04

## 背景

spec ADR-4：RAG 能力（文档接入、解析、切片、Embedding、向量检索、重排）做成独立服务，对外暴露 streamable-http MCP，由 `dsh-mcp-client` 挂载。**权限过滤在 MCP Server 内**（按用户/部门过滤检索结果）比 Agent 层更可靠。DSH 无内置 RAG（research-report §5），本工单是知识库问答的底座。

## 目标

公司知识库 RAG 服务 v1：高频文档可检索问答，结果按用户权限过滤。

## 交付物

- [x] 文档摄取管道：接入（指定目录/系统）、解析（Markdown/PDF/Word）、切片
- [x] Embedding 服务 + 向量库（试点：NVIDIA nv-embed-v1 + JSON 索引；pgvector + bge-m3 待替换）
- [x] 检索：召回 + 重排 v1（向量 top-3k → 关键词重排 → top-k）
- [x] MCP 工具暴露：`knowledge_search` + user 上下文（departments/roles/userId）
- [x] 权限过滤：文档可见性按部门/用户/分级（manifest.json，Server 端强制）
- [x] 首批知识库内容：制度文档 + FAQ + 销售部业务资料 + PDF/Word 样例

## 验收标准

- [x] 自然语言提问可命中知识库并引用出处（citation）
- [x] 用户只能检索到有权限的文档（越权检索返回空/拒绝）
- [x] 检索质量基线：Top-5 命中率 ≥75%（`npm test` eval-top5，见 test/eval-queries.json，业务方可调整）

## Comments

> 2025-08-18：**RAG v1 完成并实测**（phase0/04-mcp-server 升级）。
> - **环境调整（记录）**：pgvector 不可用（PG 容器无该扩展）、bge-m3 未部署 → 用 **NVIDIA embedding（nv-embed-v1，4096 维）+ JSON 向量索引**（试点规模 <1000 切片）；向量库抽象成 loadIndex/searchTopK 接口，pgvector 到位后替换实现
> - 摄取：docs → 切块（章节/500 字）→ 嵌入（passage 类型）→ data/index.json（`node dist/ingest.js`）
> - 检索：knowledge_search 语义优先（query 类型嵌入 + 余弦 top-k + 相似度标注），索引缺失回退关键词
> - 实测：「出差能报多少钱」→ 报销上限（0.651，关键词法无法命中）；「请假的年假标准」→ 假期类型（0.613）
> - 接线：worker.cordis + 公司 profile 的 mcp-kb 已加 KB_INDEX_PATH/EMBED_API_KEY
> 遗留：真实文档接入（等试点文档目录）；PDF/Word 解析；权限过滤（按部门，D18）；私有 bge-m3/pgvector 替换；重排（rerank）v2。

> 2026-08-22：**RAG v1 权限 + 重排 + 内容扩展**（`services/mcp-kb`）。
> - **权限过滤**：`docs/manifest.json` 定义文档分级（public/internal/confidential）+ 部门/角色可见性；`knowledge_search` 新增 `user` 参数（departments/roles/userId），Server 端强制过滤，越权返回空/拒绝提示
> - **重排 v1**：向量召回 top-3k → 关键词重叠加权（0.7 向量 + 0.3 关键词）→ top-k
> - **内容**：新增 hr-faq.md（public）、sales-playbook.md（sales 部门）、sales-confidential.md（机密 + 角色限制）
> - **测试**：`npm test` 权限/重排单测；`smoke-final.ts` 覆盖 public/internal/department/confidential 四类权限场景
> - **配置修复**：`configs/company-profile/company/cordis.patch.yml` 路径从已删除的 phase0/04-mcp-server 更新为 services/mcp-kb
> - **HTTP 修复**：`--http` 分支补 `server.connect(transport)`
> 遗留：PDF/Word 解析；pgvector + bge-m3 替换；重排 v2（cross-encoder）；正式 Top-5 命中率基线；`npm run ingest` 重建索引（含新文档，需 EMBED_API_KEY）。

> 2026-08-22（续）：**PDF/Word 解析 + Top-5 评估基线**。
> - **解析**：`src/doc-sources.ts` 支持 `.pdf`（pdf-parse v2）与 `.docx`（mammoth）；`npm run fixtures` 生成 `考勤须知.docx`、`办公用品申领.pdf`
> - **中文关键词**：`src/query-tokenize.ts` CJK bigram 分词，改善无向量索引时的回退质量
> - **评估**：`test/eval-queries.json` + `test/eval-top5.spec.ts`，试点基线 Top-5 命中率 ≥75%（`npm test` 8/8 通过）
> - **搜索重构**：`src/search.ts` 供 MCP 与 eval 共用
> 升级路径（非 v1 阻塞）：pgvector + bge-m3；重排 v2；生产文档目录接入；`EMBED_API_KEY=... npm run ingest` 重建含 PDF/Word 的向量索引。
