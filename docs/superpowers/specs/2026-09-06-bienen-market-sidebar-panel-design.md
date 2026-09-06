# 小彼恩市场：侧栏状态面板

Status: implemented  
Date: 2026-09-06  
Package: `@bienen/dsh-plugin-marketplace`  
关联：issue 24 Q19/Q24（侧边栏「小彼恩」区块 + CLI）；现有 `/biene` 与 `dsh-biene` 保留。

## 1. 问题

3a 只做了终端 `dsh-biene` 和聊天框 `/biene sync`。同事在 dsh web 里看不到公司 skill/agent 相对本机的状态；未知 `/biene` 时几乎没反馈。原 spec 要的侧栏区块还没做。

dsh 不允许往会话列表中间插一块：整列 `sidebar` 被官方占用。可加的入口是底栏 `sidebar.footer.action`（Cordis 面板同一槽），或设置页。本轮用底栏按钮 + 弹出层。

## 2. 目标

员工在 dsh web 侧栏底点「小彼恩」，看到当前 JWT 可见的已发布 skill/agent，以及相对 `$DSH_HOME` 的四种状态，并能刷新、应用、更新。登录仍在终端。不把同步结果写进会话记录。

## 3. 非目标（本轮不做）

- 钉钉扫码 / 本机 OIDC 向导（面板只提示 `dsh-biene login`）
- 设置页 `settings.section` 或 Plugins 页卡片
- 轮询、服务器推送
- 面板上的 `--force` 覆盖（冲突只提示去终端）
- 改 dsh vendor、加入 `ctx.remote` Typert 目录
- 改 dsh 标题 / logo（3b 品牌包）
- Electron `file://` 下的自定义路由（本轮只验收 `dsh web` loopback）

## 4. 架构

两段网络，浏览器不持 JWT：

```
浏览器 (dsh 页, :3080)
  GET  /bienen/status
  POST /bienen/apply
        ↓ 同源
本机 dsh Host
  读 $DSH_HOME/.bienen-market.json
  比 $DSH_HOME/skills 与 .agent-presets
        ↓ Bearer JWT
控制面 /api/plugin/skills|agents
```

不能走 `ctx.remote`：那是 dsh 编译期名单，外挂加不进去。不能走 `/biene` 命令：每次 `commands.execute` 会在会话里留下 `command/run` + `command/done`。

Host 用 `ctx.webServer.register` 挂两条 **exact** 路由（与 webhook-github 同一机制）。无 `webServer` 的 profile（headless）用可选 `ctx.inject(['webServer'], …)`：不注册路由，命令与 CLI 仍可用。

浏览器半侧：`package.json` 声明 `dsh.client`（`platform: "web"`），`exports["./client"]` 指向 factory 格式的 `client.js`。Loader 扫描已挂载插件即可上屏，不必重编 dsh。构建须包一层：

```
window.__ModuleLoader__.load({ id: "@bienen/dsh-plugin-marketplace", factory: (require) => { … return module.exports; } });
```

externals 走 loader 的 `require`（至少 `react`）。Host 继续用现有 plain JS；`src/client/` 用 TSX + 插件内打包脚本产出 `client.js`（dsh 的 `tsdown.client` preset 不发布，外挂自行复刻 banner/footer，不复制整份 preset）。

## 5. 状态语义

复用 `planSkillApply` / agent 的 origin 文件，不另造规则。

| 状态 | 条件 | 角标 | 行按钮 |
|---|---|---|---|
| `missing` 未应用 | 本地无对应文件 | 计入 | 应用 |
| `current` 已应用 | 有服务器 id，版本相同 | 不计 | 无 |
| `update` 可更新 | 有服务器 id，版本不同 | 计入 | 更新 |
| `conflict` 冲突 | 本地有文件但无服务器版本号（或 skill_id 对不上） | 不计 | 无；文案指向终端 `--force` |

Skill 路径：`$DSH_HOME/skills/<slug>/SKILL.md`。Agent 路径：`$DSH_HOME/.agent-presets/<id>/`，以 `.bienen-origin.json` 为已跟踪标记。

打开面板自动 `GET /bienen/status` 一次；之后只在刷新或应用成功/失败后重拉。不做定时轮询。

## 6. HTTP 契约

前缀固定 `/bienen`，exact 路径，无尾斜杠。仅随 webServer 注册；绑定在现有 dsh HTTP 端口上，不另开端口。

### `GET /bienen/status`

200，JSON：

```json
{
  "loggedIn": false,
  "serverUrl": "http://127.0.0.1:4000/api",
  "error": { "code": "unauthenticated", "message": "…" },
  "skills": [],
  "agents": []
}
```

`loggedIn: false` 时 **不** 请求控制面。`serverUrl` 在已保存配置时带上，供文案展示。

已登录且控制面成功时 `error` 省略。`skills[]` / `agents[]` 每项：

- skill：`id`, `slug`, `title`, `localVersion` (`string \| null`), `remoteVersion` (`string`), `state`
- agent：`id`, `title` (`string \| null`), `localVersion` (`string \| null`), `remoteVersion` (`string`), `state`

控制面 `fetch` 必须带 10s `AbortSignal` 超时。失败时：

| code | 何时 |
|---|---|
| `unauthenticated` | 无配置文件或缺 token |
| `unauthorized` | 控制面 401 |
| `unreachable` | 超时、网络错误、非 401 的 5xx/连不上 |
| `internal` | 读盘/未知异常 |

`unauthorized` / `unreachable` 时列表可为空；面板顶栏显示 `error.message`。

### `POST /bienen/apply`

JSON body：`{ "skill": "<slug 或 id>", "agent": "<id>" }`，两个字段都可选；都缺则应用全部 **非 conflict** 项。路由 **忽略** `force`；面板与该 HTTP 接口都不能覆盖冲突项。

未登录 → 401 + 与 status 相同的 JSON 形（`loggedIn: false`）。成功 → 200，在 status 快照上多：

```json
{
  "applied": ["leave-faq", "assistant"],
  "skipped": ["local-skill"],
  "failed": [{ "id": "x", "message": "…" }]
}
```

部分失败仍 200：已写入的文件保留，`failed` 列出原因，快照反映事后磁盘。

## 7. 面板 UI

槽：`sidebar.footer.action`，`id: bienen-market`，`order: 10`（Cordis 默认 0，数字小的在前，避免抢焦点）。宽栏显示「小彼恩」；窄栏图标 + 角标。角标数字 = `missing` + `update` 的 skill 与 agent 条数之和；为 0 时不显示角标。

弹出层对标 Cordis：锚在底栏按钮，点外部关闭。内容：

1. 未登录：说明 + 可复制命令 `dsh-biene login --server <serverUrl 或占位> --token <JWT>`。无刷新/应用。
2. 已登录：顶栏可有 error 条。两段列表「Skill」「Agent」，空段显示「没有可见的已发布项」。行：标题、本机版本 → 服务器版本（本机无则 `—`）、状态、按钮（见 §5）。
3. 底栏：刷新（GET status）、全部应用（POST 空 body）。全部应用进行中禁用重复提交。

`/biene sync` 与 CLI 行为不变；面板与它们共用 `runSync` / `planSkillApply`。

## 8. 测试

- `planSkillApply` 与新的 snapshot 折叠：四种状态 + skill_id 错配 → conflict。
- Host 路由：假 fs + 假控制面 — 未登录不发网；列表 diff；apply 跳过 conflict；401；10s 超时映射 `unreachable`。
- 面板（jsdom）：未登录文案；四种行；刷新；应用后角标减少。不测真实浏览器点 dsh 设置页。

## 9. 验收

- web profile 安装并重启后，侧栏底出现「小彼恩」。
- 未 `dsh-biene login`：面板提示登录命令，控制面无请求。
- 登录后能看到与 `dsh-biene sync` 同一套可见项及状态。
- 点应用后 `$DSH_HOME/skills/<slug>/SKILL.md`（或 agent preset）落盘，角标更新；会话 transcript 不出现该次操作的 command 节点。
- 冲突项不被面板覆盖。
- headless profile 仍能加载 Host 命令（若该 profile 挂了插件）；无 webServer 时不崩。
