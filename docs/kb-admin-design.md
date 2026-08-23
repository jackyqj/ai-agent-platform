# 知识库管理（Web Store Admin）— 设计

Status: implemented (Phase 1–2)  
Created: 2026-08-22  
Depends on: [17 RAG MCP v1](./issues/17-rag-mcp-v1.md)（`services/mcp-kb` 已落地）

---

## 1. 背景与问题

### 现状

| 能力 | 今天怎么做 | 痛点 |
|------|-----------|------|
| 文档入库 | 手工编辑 `services/mcp-kb/docs/*` | 非研发无法操作 |
| 可见性/权限 | 手工编辑 `docs/manifest.json` | 易错、无校验、无审计 |
| 向量索引 | CLI：`EMBED_API_KEY=... npm run ingest` | 上传后忘记重建，检索不到新文档 |
| Agent 使用 KB | Compose 勾选 MCP `kb` | 只管「能不能用工具」，不管「库里有什么」 |
| 检索验证 | `npm test` / smoke | 管理员无法在 UI 里试搜 |

RAG 引擎（MCP `knowledge_search`、权限过滤、PDF/Word 解析）已在 **mcp-kb** 完成；缺的是 **控制面 + 管理 UI**。

### 目标用户与场景

| 角色 | 场景 |
|------|------|
| **Admin** | 上传/更新制度文档；设数据分级与部门可见性；触发重建索引；试搜验证 |
| **Developer**（可选 v2） | 同上，或仅能管自己部门的文档 |
| **Employee** | 不进入 KB 管理；通过 Agent 的 `knowledge_search` 消费 |

### 非目标（v1）

- 不在 Store 里做协同编辑 / Markdown 在线编辑器（上传文件即可）
- 不替换 pgvector / bge-m3（索引仍走 mcp-kb JSON 试点）
- 不做全文版本 diff / 审批流（文档变更审计即可，审批可后续接 14 工单）

---

## 2. 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│  web/store  AdminView (#admin/config)                       │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  KbSection — 文档列表 / 上传 / 权限编辑 / 索引状态   │  │
│  └──────────────────────────┬──────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │ store-client.admin.kb*
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  control-plane  /admin/kb/*                                 │
│  KbModule — 文件 CRUD、manifest、ingest 触发、试搜、审计    │
└─────────────────────────────┬───────────────────────────────┘
                              │ 读写 KB_DOCS_ROOT / manifest.json
                              │ spawn: node dist/ingest.js
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  services/mcp-kb（不变：MCP 运行时）                         │
│  docs/ + manifest.json + data/index.json                    │
│  knowledge_search ← DSH worker stdio 挂载                     │
└─────────────────────────────────────────────────────────────┘
```

**原则**

1. **单一事实来源（Phase 1）**：文件系统仍是 source of truth，与 mcp-kb 共用 `KB_DOCS_ROOT`；控制面不复制文档内容到 PG。
2. **权限在 Server 端强制**：UI 只编辑 `manifest.json`；检索仍由 mcp-kb `canAccess()` 执行（与 17 工单一致）。
3. **复用现有 Admin 模式**：NestJS Controller + PermissionGuard + AuditStore + `AdminView` section + `useApp` actions。

---

## 3. UI 设计

### 3.1 入口

放在 **配置** 页（`#admin/config`），与 Agent / 配额 / RBAC 同级，新增 `<KbSection />`。

理由：知识库是「目录型配置资源」，不是工单式运维（工作台）或取证（调查）。

### 3.2 页面结构（KbSection）

```
┌─ 知识库 ────────────────────────────────────────────────────┐
│ 索引状态：7 篇文档 · 42 切片 · 上次重建 2026-08-22 14:30     │
│ [重建索引]  [试搜…]                                          │
├─────────────────────────────────────────────────────────────┤
│ 上传： [选择文件]  分级 [internal ▼]  部门 [多选]  [上传]     │
├─────────────────────────────────────────────────────────────┤
│ 文件名          │ 格式 │ 分级      │ 可见部门    │ 操作      │
│ 报销制度.md     │ md   │ internal  │ 全员        │ 权限 删除 │
│ sales-conf...   │ md   │ confidential │ sales  │ 权限 删除 │
│ 办公用品申领.pdf│ pdf  │ internal  │ 全员        │ 权限 删除 │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 交互细节

| 操作 | UI 行为 | 确认 |
|------|---------|------|
| 上传 | `multipart/form-data`，支持 `.md/.txt/.pdf/.docx` | 同名覆盖前 ConfirmBar |
| 编辑权限 | 行内 modal / 展开行：classification + departments[] + roles[] | 保存即写 manifest |
| 删除 | ConfirmBar | 删文件 + manifest 条目 |
| 重建索引 | 按钮 → loading → 成功/失败 toast | 无 |
| 试搜 | 小面板：query + 模拟 user(dept/role) → 展示 top-5 片段 | 无 |

**复用现有组件**：`ConfirmBar`、`Badge`（分级颜色：public=ok / internal=warn / confidential=danger）、`LoadError`、`Empty`。

**部门/角色选项**：从 `admin.users()` 聚合 dept 列表 + `admin.roles()` 的自定义角色名，与 UsersSection / AgentComposeView 词汇一致。

### 3.4 状态（useApp）

```typescript
// types.ts 新增
interface KbDocument {
  name: string;
  format: 'md' | 'txt' | 'pdf' | 'docx' | 'markdown';
  sizeBytes: number;
  updatedAt: string;
  visibility: DocVisibility;  // 与 mcp-kb permissions 对齐
  indexed: boolean;           // 是否在 index.json 中有切片
  chunkCount?: number;
}

interface KbStatus {
  documentCount: number;
  chunkCount: number;
  indexModel?: string;
  lastIngestAt?: string;
  ingestRunning: boolean;
  ingestError?: string;
}
```

`loadAdmin()` 时并行拉 `admin.kbDocuments()` + `admin.kbStatus()`。

---

## 4. API 设计（control-plane）

### 4.1 权限

```typescript
// permissions.ts 新增
'kb.manage': ['admin']   // v1 仅 admin；v2 可拆 kb.upload / kb.ingest
```

### 4.2 端点

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/admin/kb/documents` | 列表 + manifest 合并 |
| `GET` | `/admin/kb/documents/:name` | 元数据（不返原文，或 ?download=1 下载） |
| `PUT` | `/admin/kb/documents/:name` | `multipart` 上传/覆盖 + visibility JSON |
| `PATCH` | `/admin/kb/documents/:name/visibility` | 仅改 manifest |
| `DELETE` | `/admin/kb/documents/:name` | 删文件 + manifest |
| `GET` | `/admin/kb/status` | 索引统计、ingest 状态 |
| `POST` | `/admin/kb/ingest` | 异步触发 ingest（202 + job id） |
| `POST` | `/admin/kb/search` | 管理员试搜（proxy mcp-kb search 逻辑） |

### 4.3 KbService 实现要点

```typescript
// 环境变量（与 worker.cordis 对齐）
KB_DOCS_ROOT=/path/to/services/mcp-kb/docs
KB_INDEX_PATH=/path/to/services/mcp-kb/data/index.json
KB_INGEST_CMD=node dist/ingest.js   // cwd = services/mcp-kb
EMBED_API_KEY=...                   // 已有 secrets 或 env
```

|  Concern | 方案 |
|---------|------|
| 文件写入 | 只允许 `KB_DOCS_ROOT` 下 basename，拒绝 `..` |
| manifest | 读-改-写 `manifest.json`，原子写（tmp + rename） |
| ingest | `child_process.spawn`，单飞（ingestRunning 锁）；stdout/stderr 落日志 |
| 试搜 | 直接 import/reuse mcp-kb `knowledgeSearch()` 或 HTTP 调本地 mcp-kb |
| 审计 | `admin.kb.upload` / `admin.kb.delete` / `admin.kb.ingest` / `admin.kb.visibility` |

### 4.4 store-client 扩展

```typescript
admin: {
  kbDocuments(): Promise<{ documents: KbDocument[] }>;
  kbStatus(): Promise<KbStatus>;
  uploadKbDocument(name: string, file: File, visibility: DocVisibility): Promise<{ ok: boolean }>;
  patchKbVisibility(name: string, visibility: DocVisibility): Promise<{ ok: boolean }>;
  deleteKbDocument(name: string): Promise<{ ok: boolean }>;
  triggerKbIngest(): Promise<{ ok: boolean; startedAt: string }>;
  kbSearch(body: { query: string; limit?: number; user?: UserContext }): Promise<{ hits: SearchHit[] }>;
}
```

上传用 `FormData` + `fetch`（与现有 JSON `request()` 并列一个小 helper）。

---

## 5. 数据模型

### Phase 1（推荐先做）

无新 PG 表。元数据 = **manifest.json + 文件 stat + index.json 统计**。

```json
// manifest.json 条目（已有）
{
  "报销制度.md": {
    "classification": "internal",
    "departments": ["*"],
    "roles": []
  }
}
```

`GET /admin/kb/documents` 合并：

- `readdir` 支持的扩展名
- `manifest[name]` 或默认 `{ classification: 'internal', departments: ['*'], roles: [] }`
- `stat` → sizeBytes, updatedAt
- 扫 `index.json` chunks → indexed, chunkCount

### Phase 2（可选，百万切片前）

```sql
-- migrations/013_kb_documents.sql
CREATE TABLE kb_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL UNIQUE,
  classification text NOT NULL CHECK (classification IN ('public','internal','confidential')),
  departments text[] NOT NULL DEFAULT '{*}',
  roles text[] NOT NULL DEFAULT '{}',
  storage_ref text,           -- 对象存储 key
  chunk_count int,
  indexed_at timestamptz,
  uploaded_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kb_ingest_jobs (
  id uuid PRIMARY KEY,
  status text NOT NULL,       -- pending|running|done|failed
  started_by text,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  chunk_count int
);
```

PG 成为 registry；文件/object storage 存内容；ingest 写 pgvector。

---

## 6. 与 mcp-kb / DSH 的关系

```
上传/改 manifest ──► docs/ + manifest.json
        │
        ▼ POST /admin/kb/ingest
   ingest.ts ──► data/index.json
        │
        ▼（worker 已挂载，无需重启 MCP）
   knowledge_search 读到新 index（loadIndex 每次请求读文件）
```

| 问题 | 答案 |
|------|------|
| 上传后要重启 worker 吗？ | **不需要**。index 按路径每次 `loadIndex`；可选 ingest 完成后 touch 通知 |
| Agent 怎么知道有新文档？ | 自动；只要 preset 开了 `mcp: ['kb']` |
| 用户 dept/role 谁传？ | Agent 调用工具时应带 user 上下文；Store 试搜可模拟 |
| confidential 文档 | UI 上传时警告 + 钉死 internal 默认；confidential 需 admin 显式选 |

---

## 7. 分阶段交付

### Phase 1 — 可运维（2–3 天）

- [x] `KbModule` + `/admin/kb/*` CRUD + ingest 触发
- [x] `kb.manage` 权限 + 审计
- [x] `KbSection` UI：列表、上传、权限编辑、删除、重建索引
- [x] 试搜面板

**验收**：Admin 在 UI 上传一篇 md → 重建索引 → 试搜命中 → Agent 侧 `knowledge_search` 可检索。

### Phase 2 — 体验与治理（+2 天）

- [x] ingest 进度/失败原因展示
- [x] 上传前格式校验、文件大小上限
- [x] 部门内容管理员（`kb.manage` 赋给 custom role，非全局 admin）
- [x] 文档变更审计列表（filter `eventType: admin.kb.*`）

### Phase 3 — 规模化（随 D17）

- [ ] PG `kb_documents` + 对象存储
- [ ] pgvector 替换 JSON index
- [ ] 批量导入、目录 watch、钉钉文档同步

---

## 8. 安全与合规（D18）

| 控制 | 实现 |
|------|------|
| 数据分级 | UI 三档：public / internal / confidential；confidential 必须选 roles |
| 越权上传 | `kb.manage` + 审计 userId |
| 路径穿越 | basename 校验 |
| 机密进云端 | manifest confidential + 网关路由（已有 D18 方向）；UI 提示 |
| 删除 | ConfirmBar + 审计 |

---

## 9. 文件清单（实现时）

| 层 | 新增/修改 |
|----|----------|
| CP | `src/kb/kb.module.ts`, `kb.controller.ts`, `kb.service.ts` |
| CP | `common/permissions.ts` → `kb.manage` |
| CP | `app.module.ts` 注册 KbModule |
| Store | `types.ts`, `store-client.ts`, `useApp.ts`, `AdminView.tsx` → KbSection |
| Docs | 本文件 + `docs/issues/XX-kb-admin.md` 工单 |

**不改** `services/mcp-kb` 运行时契约；最多抽 shared types 到 `packages/kb-types`（非必须）。

---

## 10. 待你拍板的问题

1. **v1 谁可以管 KB？** 仅 `admin`，还是 HR/法务等 custom role 也开放 `kb.manage`？
2. **上传体积上限？** 建议单文件 20MB，总量按 pilot 目录配额。
3. **同名覆盖策略？** 建议必须 ConfirmBar + 审计。
4. **ingest 失败时** 是否允许「仅关键词、无向量」上线？（与现 mcp-kb 回退一致）
5. **是否 Phase 1 就要试搜？** 建议要——否则管理员无法自证入库成功。

---

## 11. 推荐结论

**先做 Phase 1**：控制面代理文件系统 + manifest，UI 进 Config 页，ingest 一键触发。这与现有 Agent/Quota/Secrets 管理模式一致，改动面可控，且直接解决「非研发无法维护知识库」的痛点。

Phase 2/3 随 pilot 文档量与 pgvector 迁移节奏再开。
