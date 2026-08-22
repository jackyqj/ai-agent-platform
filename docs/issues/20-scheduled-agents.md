# 20 定时 Agent（周期任务）

Status: open
Type: task
Phase: Phase 3 — 知识库与自动化（第 11–14 周）
Blocked by: 19

## 背景

spec §5 Phase 3「定时 Agent（基于 `dsh-schedule` 或控制面 cron）」。DSH 原生 `dsh-schedule` 是会话级提醒（after/at/every，状态在会话事件日志），适合会话内提醒；平台级周期任务（每日汇总、周报）由控制面 cron + 19 的运行时池驱动更合适。

## 目标

用户可创建周期任务：Agent 定时执行并推送结果（报表、周报、监控巡检等）。

## 交付物

- [x] 定时任务配置（表达式/时区/目标 Agent/结果推送方式）
- [x] 调度器：控制面 cron 触发 19 运行时池
- [x] 任务历史与失败重试（复用 19）
- [x] 与 `dsh-schedule` 的边界划分：会话内提醒 vs 平台级周期任务
- [x] 定时任务管理界面（Web 任务中心 + 管理后台）

## 验收标准

- [x] 周期任务按 cron 准时触发，结果推送成功
- [x] 失败重试与告警符合预期
- [ ] 至少 1 个高频场景（如周报）跑通并进入 05 场景清单验证

## Comments

> 2025-08-19：**定时 Agent 完成并实测**（src/scheduled/）。
> - 迁移 005：scheduled_tasks 表（owner/agent_preset/schedule/task_template/status/next_run_at）
> - 调度：每分钟 tick 查到期 → 复用任务队列（submit 含配额+审批门）→ 滚动 next_run_at；格式 'daily HH:MM' | 'every <N>m/h'
> - API：创建/我的列表/run-now/暂停恢复/删除 + admin 全量（PermissionGuard）
> - 实测：创建 every 1m → run-now 入队执行；tick 自动触发（1/1，任务数 2，scheduled.fired 审计）；暂停后不触发；report-builder 定时任务触发 → 审批 pending（不入队，等待授权）
> 遗留：时区（当前服务器本地）；cron 完整表达式；执行失败告警；与 18 IM 的结果推送联动。

> 2025-08-22：**时区 + 完整 cron + 执行失败告警落地**（20 收尾）。
> - 迁移 010：scheduled_tasks 增 timezone（默认 Asia/Shanghai）/last_run_at/last_run_status；新增 scheduled_run_logs
> - 时区：任务级 timezone；daily 与 cron 按该时区计算（Intl 求 tz offset；Asia/Shanghai 无 DST 精确），every 为时长与时区无关
> - 完整 cron：接入 cron-parser（新直接依赖，含时区），5 段「分 时 日 月 周」；仍兼容 daily/every
> - 失败告警：每次触发写 scheduled_run_logs（fired/failed）+ 更新 last_run_status + 审计 scheduled.failure；管理面 GET /admin/scheduled-runs?status=failed + 单任务运行历史 GET /scheduled-tasks/:id/runs；Web 用户区「我的定时任务」+ 管理后台「定时任务/失败列表」
> - 单测 12/12 + 真实 PG 集成冒烟（cron tz / daily tz / run logs 过滤）；控制面 82/82、web 18/18
> 遗留：与 18 IM 的结果推送联动（等真实群 @ 验收）。

> 2025-08-22（复查修订）：区分「等待审批」与「已执行」——`submit` 返回 `awaitingApproval` 时记 `awaiting` 状态
> （不再误记为 fired），`last_run_status`/UI 徽标同步新增「待审批」档；`scheduled.failure` 审计补 ownerUserId 归属；
> 失败重试由 19 队列 BullMQ attempts 承担（本期复用，未另建调度级重试）。单测 12/12、控制面 82/82、web 18/18。
