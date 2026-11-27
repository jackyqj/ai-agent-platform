# 会话文件 workspace 按 session 隔离

Status: accepted (design review 2026-11-26: approve-with-changes)
Type: task
Phase: Worker 运行时隔离

## 背景

员工对话与一次性任务目前共用 `dsh-source/apps/task-worker/workspace` 作为 DSH initialize cwd / `DSH_CWD` / `workspace-write` 回退根。`.sessions-worker/` 只是 JSONL 会话日志根（`DSH_SESSION_ROOT`），不是文件沙箱。

后果：不同用户、不同对话、并发 worker 读写同一目录；产物（如 `sso-design.md`）泄漏到共享盘；JSONL 若被当成沙箱根则可被模型改写。

DSH 已按 session 工作目录收紧 `workspace-write`（`sandbox-policy`：agent 调用用 session cwd）。平台只要给每个 session 独立、已存在的绝对 cwd。

## 目标

每个 DSH session（商店 `sessionId` 或一次性 `task-{id}-a{attempt}`）有自己的可写目录；`workspace-write` 限制在该目录内；JSONL 日志与其它 session 的文件都在边界外。

## 方案对比

| | A：日志根下 `workspaces/<id>` | B：兄弟目录 `.session-workspaces/<id>` |
|---|---|---|
| 落盘 | `.sessions-worker/workspaces/<sessionId>/` | `task-worker/.session-workspaces/<sessionId>/` |
| 一键清理 | 已 gitignore 的 `.sessions-worker/` | 要再 ignore 一个根 |
| 误把日志根当沙箱 | 若 `workspaceRoot=.sessions-worker` 则日志+全部 workspace 可写 | 物理分开，误配面小 |
| 与用户约定 | 用户要求落在 `.sessions-worker` 并限制在里面 | 更干净的职责分离 |

**选用嵌套 A**：JSONL `listProjectDirs` 把 root 下一层每个目录当 project，再把 `<project>/<id>` 当 session 槽并扫描 `session*.jsonl`。平坦 `workspaces/<id>` 正好落在该槽上，模型一旦写下 `session.jsonl` 会触发 duplicate id。因此可写叶是 `workspaces/<id>/cwd/`，session 槽本身不给 agent 写。

放弃「Harness 仍指向共享 `workspace/`，只靠工具约定」：并发 actor 写同一目录，违反按 session 拆分共享状态。

## 决策

1. **JSONL 根**（不可写）：绝对路径 `DSH_SESSION_ROOT`，默认 `<task-worker>/.sessions-worker`（相对值相对 worker 模块目录解析）。Worker 注入绝对路径。`processCwd` 与 harness `cwd` 同为可写叶（绝对路径），避免 dsh 子进程继承 Worker 的仓库目录。
2. **Worker 读的 `DSH_CWD`**：可选的 **workspaces 父目录**。未设则为 `<sessionRoot>/workspaces`。
3. **子进程看到的 `DSH_CWD` / harness `cwd`**：可写叶 `join(parent, safeSessionId, 'cwd')`，mkdir 后必须已存在。`safeSessionId` 仅 `[A-Za-z0-9._-]+`，整段拒绝 `.` / `..`。realpath 后必须仍在 parent 内且不是 parent 本身。
4. **旧会话**：`mkdir` → 构造 harness（cwd=叶）→ `resumeSession` → **仅 resume 成功后** `setWorkingDirectory(叶)` → `run`。create 路径不 set（避免未知 id 被当成 create）。不搬迁共享目录旧文件；共享 `workspace/` 仍可作为旧 header.cwd 的恢复目标。
5. **权限档**：`danger-full-access` 仍可逃出文件边界；本变更不改角色映射。员工路径用平台 overlay `@deepseek-ai/dsh-fs-sandbox-read` 替换上游 `fs-sandbox`：写入仍按 `workspace-write`（含 `/tmp`），**读/stat/list/watch/lstat** 只允许 session workspace（及 `additionalWritableRoots`），不含平台 temp。`lstat` 围的是链接节点本身（不跟随最后一跳），所以工作区外指向内部的 symlink 也会被拒；`read`/`stat` 仍跟随后再围。`processPathFromHostPath` 同样按可读根过滤。`glob`/`grep`（`tool-fs-search`）走 ripgrep 子进程、不经 `ctx.fs`，员工组合关掉。同时关闭 `agent-instructions`（`disabled` + `maxBytes: 0` + 空 candidates）和宿主 skill 发现：`skill-filesystem.includeDefaultRoots: false`（`customSkillDirs: []`、`watch: false`），并禁用 `tool-skill` / `skill-office` / `upstream-skills`，避免沿 git 根注入 `AGENTS.md` 或编入宿主 skills。
6. **范围**：只改 extra：`dsh-source/apps/task-worker/`、`dsh-source/packages/platform/fs-sandbox-read/`，以及 `docs/system-arch42.md`、`docs/RUN-LOCALLY.md`。不改上游 DSH 包。

## 验收

- 两个 session 的 harness cwd 不同，且都是 `.sessions-worker/workspaces/<id>/cwd`。
- session id 含 `..` 或路径分隔符时拒绝创建。
- JSONL 根是绝对 `.sessions-worker`，不在 session workspace 内。
- 新建 session 不写 `task-worker/workspace/`。
- 单测覆盖路径解析、id 校验、realpath 越界、resume 后绑定 cwd。
- `read`/`stat`/`listDir`/`watch` 拒绝 workspace 外的绝对路径、`..` 穿越、指向外部的 symlink；`additionalWritableRoots` 下可读；`danger-full-access` 仍可读外部。
- `lstat` 拒绝工作区外的路径（含指向内部的 symlink）；工作区内指向外部的 symlink 可以 lstat，但不能 read。
- 员工 `worker.cordis.yml` 禁用上游 `fs-sandbox` 与 `tool-fs-search`，插入 `fs-sandbox-read`；禁用 `tool-skill` / `skill-office` / `upstream-skills`。
