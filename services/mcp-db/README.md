# 只读数据库 MCP Server（company-mcp-db）

试点「数据查询报表」场景的技术底座（D19 场景 3）。stdio 传输（Phase 0 模式），
被 DSH 运行时（worker.cordis.yml 的 `mcp-db` 行）拉起。挂载后工具名：`mcp__db__list_tables` / `mcp__db__query_readonly`。

## 安全设计（v1，防御纵深）

| 层 | 机制 |
|---|---|
| 连接级 | PostgreSQL `default_transaction_read_only=on` + `statement_timeout=10s`（服务器强制，写操作直接报错） |
| 语句级 | 必须 SELECT 开头、单语句、禁止 DML/DDL/危险关键词 |
| 白名单 | 仅 `DB_ALLOWED_TABLES`（schema.table 列表）；缺省拒绝一切（fail-closed）；白名单外表引用直接拒绝 |
| 上限 | 自动追加 LIMIT（缺省 50）、客户端截断 50 行 / 20KB、语句超时 10s |
| 审批位 | 敏感查询的审批流由 14 工单授权存储承接（本工具 v1 不内置） |

## 运行与验证

```sh
npm install --cache <workdir>/.npm-cache
npm run build          # → dist/index.js
npx tsx test/smoke.ts  # SDK client 冒烟：list_tables + 合法/非法查询全过（见下）
```

冒烟验证（2025-08-18 全过）：
- `list_tables` → 白名单表 + 字段类型
- 合法聚合查询 → 4 区域销售总额正确返回
- `DELETE ...` → 「查询被拒绝：只允许 SELECT 查询」
- 白名单外 `public.tasks` → 「引用了白名单外的表」
- 自动 LIMIT + 行数/耗时标注

## 接入（worker.cordis.yml 已配）

```yaml
- id: mcp-db
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: db
    transport: stdio
    command: node
    args: ['<path>/mcp-db-server/dist/index.js']
    env:
      DB_DSN: !!js process.env.DB_DSN ?? 'postgres://...'
      DB_ALLOWED_TABLES: demo_sales.regions,demo_sales.products,demo_sales.orders
```

## 演示数据

`control_plane` 库 `demo_sales` schema（4 区域 × 8 产品 × 80 订单，2026 Q2），
支持「区域销售总额/产品分类汇总/时间趋势」等试点报表查询。

## 已知问题与发现（2025-08-18 记录）

1. **模型工具调用合规性不可靠（重要）**：NVIDIA 托管 `deepseek-v4-flash-0731` 在 worker 运行时
   多次出现「假装调用工具、编造输出」——`tool/call` 事件为 0，却声称"工具返回结果如下"且表名虚构
   （M0 时同模型成功调用过 knowledge_search 两次，行为不稳定）。llama-3.3-70b 在窗口内也未完成调用。
   工具注册与 schema 投递均正常（会话日志可证）。**结论：管线无问题，模型选择是试点前需解决的真问题**
   ——评估工具调用可靠的模型（或私有 Qwen 系），并纳入 Phase 3 模型评估输入。
2. **多轮工具任务耗时**：3-5+ 分钟（慢模型 × 多轮），默认 5min 任务超时偏紧 → worker 已支持
   `CP_TASK_TIMEOUT_MS`（建议 10min）；preset/网关侧按任务类型定超时的细化留给 16 工单。
3. **查询校验为粗解析**：表名提取靠正则，复杂 SQL（CTE/子查询）可能误判或漏判；连接级只读是兜底。
   生产化建议引入 SQL 解析器（pg-query-parser 等），列入 14 工单安全评审范围。
