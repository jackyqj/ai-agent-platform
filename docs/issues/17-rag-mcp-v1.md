# 17 RAG MCP Server v1（知识库 + 权限过滤）

Status: open
Type: task
Phase: Phase 2 — Agent 目录与治理（第 7–10 周）
Blocked by: 04

## 背景

spec ADR-4：RAG 能力（文档接入、解析、切片、Embedding、向量检索、重排）做成独立服务，对外暴露 streamable-http MCP，由 `dsh-mcp-client` 挂载。**权限过滤在 MCP Server 内**（按用户/部门过滤检索结果）比 Agent 层更可靠。DSH 无内置 RAG（research-report §5），本工单是知识库问答的底座。

## 目标

公司知识库 RAG 服务 v1：高频文档可检索问答，结果按用户权限过滤。

## 交付物

- [ ] 文档摄取管道：接入（指定目录/系统）、解析（PDF/Word/Markdown）、切片
- [ ] Embedding 服务 + 向量库（已定 D17：**pgvector + 私有 bge-m3**；切片量到百万级再评估迁 Milvus）
- [ ] 检索：召回 + 重排 v1
- [ ] MCP 工具暴露：`knowledge_search` 等，带用户上下文
- [ ] 权限过滤：文档可见性按部门/用户（在 Server 端强制，D18 数据分级对接）
- [ ] 首批知识库内容（已定 D17/D19：制度文档 + FAQ + 一个业务部门资料）

## 验收标准

- [ ] 自然语言提问可命中知识库并引用出处（citation）
- [ ] 用户只能检索到有权限的文档（越权检索返回空/拒绝）
- [ ] 检索质量基线：Top-5 命中率（与业务方共同设定）

## Comments

> 2025-08-18：**RAG v1 完成并实测**（phase0/04-mcp-server 升级）。
> - **环境调整（记录）**：pgvector 不可用（PG 容器无该扩展）、bge-m3 未部署 → 用 **NVIDIA embedding（nv-embed-v1，4096 维）+ JSON 向量索引**（试点规模 <1000 切片）；向量库抽象成 loadIndex/searchTopK 接口，pgvector 到位后替换实现
> - 摄取：docs → 切块（章节/500 字）→ 嵌入（passage 类型）→ data/index.json（`node dist/ingest.js`）
> - 检索：knowledge_search 语义优先（query 类型嵌入 + 余弦 top-k + 相似度标注），索引缺失回退关键词
> - 实测：「出差能报多少钱」→ 报销上限（0.651，关键词法无法命中）；「请假的年假标准」→ 假期类型（0.613）
> - 接线：worker.cordis + 公司 profile 的 mcp-kb 已加 KB_INDEX_PATH/EMBED_API_KEY
> 遗留：真实文档接入（等试点文档目录）；PDF/Word 解析；权限过滤（按部门，D18）；私有 bge-m3/pgvector 替换；重排（rerank）v2。
