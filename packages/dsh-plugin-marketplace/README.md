# @bienen/dsh-plugin-marketplace

阶段 3a：把控制面上已发布的 skill / agent 拉到本机 dsh（落盘即可被发现）。不改 dsh 标题和 logo。

默认打进员工现有 **web** profile（`dsh web` / 端口 3080）。公司内部 `company` profile 同样可用。

客户端入口：终端 `dsh-biene`、聊天框 `/biene sync`，以及侧栏底「小彼恩」面板（看状态 / 应用 / 更新）。钉钉回调域名是商店前端，复制 `#token=` 即可（控制面 OIDC redirect 不指向本机端口）。

登录仍在终端。面板不持 JWT，只请求本机 dsh 的 `GET /bienen/status` 与 `POST /bienen/apply`。冲突项不会被面板覆盖（终端加 `--force`）。

改客户端 UI 后需重新打包浏览器半侧：`npm install && npm run bundle`（产出仓库内的 `client.js`）。

## 安装

```sh
# 同事已有官方 dsh（npm latest 或与本仓库 vendor 对齐的 0.1.3-alpha.1）
dsh plugin --profile web add /path/to/ai-agent-platform/packages/dsh-plugin-marketplace

# CLI（不必先 plugin add）
node packages/dsh-plugin-marketplace/src/cli.js help
# 或：npx --prefix packages/dsh-plugin-marketplace dsh-biene help
```

内网 npm 有 registry 时：`dsh plugin --profile web add @bienen/dsh-plugin-marketplace`。

## 登录与同步

JWT 一律必带。无 refresh；401 后重新 login。

```sh
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"

dsh-biene login --server http://<控制面>/api --token <JWT>
# 本地开发：
dsh-biene login --server http://127.0.0.1:4000/api --dev-user u-admin

dsh-biene sync          # 刷新并应用全部可见项
dsh-biene sync --skill leave-faq
dsh-biene sync --agent assistant
dsh-biene sync --force  # 覆盖本地自建（无服务器 metadata）的同名 skill / preset
```

落点：

- skill → `$DSH_HOME/skills/<slug>/SKILL.md`（frontmatter metadata 含 `skill_id` + `version`）
- agent → `$DSH_HOME/.agent-presets/<id>/`（含快照 `skills/`）

冲突：带服务器版本号 → 覆盖升级；本地自建（无版本号）→ 跳过，除非 `--force`。
