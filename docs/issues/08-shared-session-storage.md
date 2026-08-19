# 08 共享会话存储（PostgreSQL 后端）

Status: open
Type: prototype
Phase: Phase 1 — 多用户与身份（第 3–6 周）
Blocked by: 01

## 背景

spec ADR-5：按 DSH 能力缝规范实现 PostgreSQL 版 `SessionPersistence`，使会话跨实例、跨设备可恢复；附件走对象存储。能力缝 = Service Definition / Provider / Consumer 三角色分离（research-report §1），缝不变量必须遵守（append-only、seq 连续、崩溃收尾、格式版本）。控制面数据模型见 enterprise-shell §4（`sessions`/`instances` 表，实例恢复依赖本工单）。存储形态已定（D15）：**单库多 schema 起步**（session_events/platform_meta/audit），预留分表迁移路径；**对象存储已有现成 S3**（D14），附件直接对接。

## 目标

先原型验证「能力缝可替换性」与不变量，再产出生产版共享存储后端。

## 交付物

- [ ] 原型：实现 `SessionPersistence` Provider（PostgreSQL，事件表 + 元数据表），本地 DSH 换后端跑通会话存取
- [ ] 不变量验证：append-only、seq 连续性、崩溃尾部收尾、格式版本冻结（SESSION_FORMAT_VERSION=0）
- [ ] 并发/多实例访问验证：同一会话跨实例恢复
- [ ] 附件与文档走对象存储（S3 兼容），会话事件只存引用
- [ ] 性能基线：写入吞吐、恢复延迟、冷启动会话
- [ ] JSONL 本地回退保留（开发调试用），写入 `map.md` 决策

## 验收标准

- [ ] 会话在实例 A 创建，实例 B 无缝恢复续聊
- [ ] 进程被 kill 后会话日志平衡（无损坏、无丢失）
- [ ] 原型结论决定生产实现方案（表结构/迁移策略），记录决策

## Comments

> 2025-08-16：**核心完成并实测**。两块：
> ① 控制面元数据落 PG（`phase1/control-plane/`）：sessions/instances 仓库化，
>    **重启后会话从 PG 恢复实测通过**（SID 一致）；audit_events 已先行落 PG。
> ② **DSH SessionPersistence PG Provider**（`dsh-source/packages/session/session-persistence-pg/`，
>    平台自有定位，移植 SQLite 后端）：headless 挂载实测——模型调用（无 key）失败前，
>    会话行 + 8 条事件（含 user/message 原文）已持久化到 `dsh_sessions` schema，seq 连续、revision 递增。
>    已接入公司 profile（02 工单 cordis.patch.yml：禁用 jsonl + 插入 pg，url 走 env）。
>
> 2025-08-18：**测试套件完成（54/54 全绿）**。`tests/persistence.spec.ts`：跑仓库共享契约
> `runPersistenceContract`（存储语义）+ `runCoordinatorContract`（写路径编排：懒创建/fork seed/采纳/
> 崩溃修复/重载/flush/disposal）+ 聚焦测试（seek 读、平衡视图）；随附 `src/invariant.ts` companion
> 与 README（Model Experience 格式）。覆盖率 89.7% 行/87.4% 分支——缺口为 config 回退/错误路径/
> `prepare`/`locate` 委托等机械性分支；**达上游 100% 门禁需按补测清单补齐（清单见 README Known Limitations）**。
> 2025-08-18（续）：**覆盖率 100% 达成**——新增 tests/edge.spec.ts（config 回退/空值/委托/错误路径/约束冲突/scanRows committed throw 等边界），71/71 测试全绿 + 覆盖率 100%×4 指标×2 文件，已达上游逐文件门禁；README 已更新。
> 遗留：跨实例 A/B 无缝续聊验收（需模型 key 场景跑通后验证）；剩余上游门禁（doc-sync/双语 README/Agent Note）待贡献决策。
