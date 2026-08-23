# 公司知识库 MCP Server（company-mcp-kb）

> 17 工单 RAG v1：语义检索 + 重排 + 权限过滤 + Markdown/PDF/Word 解析。

## 开发运行

```sh
npm install
npm run build
npm run fixtures   # 生成 PDF/Word 样例（需 macOS Arial Unicode 或 KB_CJK_FONT）
node dist/index.js # stdio（DSH 拉起）
```

## 摄取（重建向量索引）

```sh
EMBED_API_KEY=... npm run ingest   # docs/* + manifest.json → data/index.json
```

## 验证

```sh
npm test           # 权限、重排、解析、Top-5 基线（≥75%）
npx tsx smoke-final.ts
npm run eval       # 仅 Top-5 评估
```

## 文档格式

| 格式 | 解析器 |
|------|--------|
| `.md` / `.txt` | 原生 UTF-8 |
| `.pdf` | pdf-parse v2 |
| `.docx` | mammoth |

可见性：`docs/manifest.json`（public/internal/confidential + 部门/角色）。

## MCP 工具 `knowledge_search`

| 参数 | 说明 |
|------|------|
| `query` | 检索问题 |
| `limit` | 1–10，默认 5 |
| `user` | `{ departments[], roles[], userId? }` 权限上下文 |

## 接入 DSH

```yaml
- id: mcp-kb
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: kb
    transport: stdio
    command: node
    args: ['/path/to/services/mcp-kb/dist/index.js']
    env:
      KB_DOCS_ROOT: /path/to/services/mcp-kb/docs
      KB_INDEX_PATH: /path/to/services/mcp-kb/data/index.json
      EMBED_API_KEY: !!js process.env.EMBED_API_KEY ?? ''
```

## 升级路径

- pgvector + 私有 bge-m3（替换 JSON 索引）
- 重排 v2（cross-encoder）
- streamable-http 多用户（SDK Node 26 挂起问题修复后）
