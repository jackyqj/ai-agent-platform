# 公司知识库 MCP Server（company-mcp-kb）

> 17 工单 RAG 已升级：knowledge_search 语义优先（NVIDIA embedding nv-embed-v1 + JSON 向量索引），索引缺失回退关键词。摄取：`EMBED_API_KEY=... node dist/ingest.js`（docs → 切片 → data/index.json）。

首个内部 MCP Server（04 工单）。**默认 stdio 传输**（Phase 0 内部单机首选：DSH 直接拉起子进程，无端口无鉴权头），`--http` 保留 streamable-http 升级路径。v0 为**关键词检索**（docs/ 目录），17 工单升级为向量 RAG（pgvector + bge-m3），工具契约不变。

## 开发运行

```sh
npm install --cache <workdir>/.npm-cache   # 沙箱环境下 npm 缓存指到工作区内
npm run build            # → dist/index.js
node dist/index.js       # stdio 模式（由 DSH dsh-mcp-client 拉起，无需手动运行）
node dist/index.js --http  # streamable-http 模式（Phase 1+ 服务化升级路径）
```

## 验证（不依赖 DSH）

```sh
npx tsx test/smoke-final.ts   # 官方 SDK Client 走 stdio：tools/list + 2 次检索 + 无命中兜底
```

## 接入 DSH（02 工单 profile 的 cordis.patch.yml，stdio 模式）

```yaml
- id: mcp-kb
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: kb
    transport: stdio
    command: node
    args: ['/path/to/company-mcp-kb/dist/index.js']
    env:
      KB_DOCS_ROOT: /srv/company-docs   # 生产：只读挂载的制度文档目录
```

挂载后 Agent 看到的工具名：`mcp__kb__knowledge_search`。

## v1 升级路径（17 工单）

- 解析：PDF/Word 接入（unstructured/自研解析）
- 切片 + Embedding（私有 bge-m3，D17）
- 向量库：pgvector（D17），百万切片再评估 Milvus
- 权限过滤：文档可见性按部门/用户（服务端强制，D18 数据分级对接）
- 传输：多用户并发 → streamable-http（需先解决下方已知问题）

## 已知问题（Phase 0 记录）

**SDK 1.30.0 的 streamable-http（HTTP/SSE）路径在 Node 26 下响应挂起**：`tools/list`/`initialize` 返回 200 + `content-type: text/event-stream` 但 body 为空，SDK 官方 Client 与 curl 均复现；stdio 路径完全正常。已按官方模式排查（stateless/stateful、hono/express/纯 node:http），确认为 SDK 与运行时兼容问题。**处置**：Phase 0 用 stdio（DSH 原生支持）；Phase 1+ 服务化前升级 SDK 或锁定 Node 22/24 LTS 复验（DSH 生产基线为 Node ^22.19 || >=24）。升级路径代码保留在 `src/index.ts --http` 分支。

## TODO（多用户并发）

v0 stdio 单进程。多用户并发时切 streamable-http（每会话 transport，见 MCP SDK session 模式），并在 DSH 侧按用户注入上下文——Phase 1 的 07/06 工单落地时处理。
