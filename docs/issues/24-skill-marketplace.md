# 24 Skill 市场与 dsh 客户端同步

Status: accepted
Type: epic（拆 3 阶段实施；阶段 3 再拆 3a 插件 / 3b 品牌包）
Phase: 待排期
关联: #22（反馈闭环——本需求是 skill 级反馈+工单，与 #22 的会话级反馈有交集，聚合看板需协调）
Blocked by: 07（SSO/JWT）、12（Agent 商店）、13（RBAC 权限点）

## 1. 背景

需求来源（小彼恩内部团队）：

1. 平台增加 skill 管理：用户可添加新 skill、提交反馈（赞/踩）、提交更改请求（针对 skill 某句话提出修改建议）。
2. Agent 定义时可选用 skills。
3. 创建 dsh 客户端插件：在客户端 dsh 显示服务器上的 agent 与 skills，用户点击「应用/更新」把 agent 和 skills 拉取到本地；同时把 dsh 的 logo 和标题改为「小彼恩dsh」。

**平台现状**（已核查，grep 零命中）：无任何 Skill / Feedback / Rating / Comment 实体。可复用先例：`approval_requests`（审核流，14 工单）、`agent_preset_revisions`（版本快照表）、JWT + DingTalk OIDC 认证（07 工单）、钉钉 Stream 机器人（18 工单，含 DingtalkApi 会话回复能力，无主动消息/通知服务）、RBAC + departments（13 工单）。

**dsh 侧事实**（已核查 dsh 源码）：MIT 协议（改名合法，需保留版权声明；「DeepSeek」商标不受 MIT 授权，logo 必须换）；Cordis 插件机制（`dsh plugin --profile <name> add <pkg>`，manifest 声明 `dsh.profile.bundles` + `cordis.patch.yml` 补丁层）；skill 本地格式为 `<name>/SKILL.md`（或平铺 `<name>.md`），YAML frontmatter 必须含 `name`(kebab-case)+`description`；标题为构建期变量（`DSH_CLIENT_TITLE`），logo 走 `DSH_CLIENT_BUILD_PROFILE=official` 品牌插槽——**品牌只能构建期改，无运行时覆盖**；无 dsh↔远程服务器协议、不支持远程 host，同步必须由插件自建 HTTP 拉取 + 写本地目录。preset 要让 Agent 加载 skill，须在 preset 层挂 `skill-filesystem` + `tool-skill`，`customSkillDirs` 指向 preset 相对 `skills/`（dsh cordis preset 先例）；`<preset>/.dsh/skills/` 是项目 cwd 发现路径，不能当 preset 快照目录。

## 2. 目标

- **树1 · skill 管理**：创建 → 审核 → 发布 → 使用的完整生命周期；赞/踩反馈与评分排序；逐句改稿建议的工单闭环。
- **树2 · Agent 绑定**：Agent 定义时选用 skills，编译时快照进 preset 包（版本自包含）。
- **树3 · 客户端**：3a Cordis 插件在员工现有 dsh 上浏览/应用/更新；3b 品牌安装包将客户端与 Web 改为「小彼恩dsh」。应用 = 落盘并被本地 dsh 发现，不是在本地复制一套控制面运行时。

## 3. 非目标（本轮不做）

- 对外发布（纯内部团队工具，Q1）
- 差评自动下架（Q3）、工单自动合并（Q4）
- 服务器推送同步（Q28，长连接不做）
- dsh 运行时标题覆盖（构建期限制，不可行）；**3a 不改员工现有 rc.2 的标题/logo**
- 钉钉机器人主动消息（Q23，增强项，待权限与排期）
- 严格分类树（Q12，用 tags）
- skill 附件包（`scripts/` `references/` `assets/`）；本轮只存单文件 SKILL.md
- 插件内网免认证（Q16 已否；一律 JWT）
- 本地「应用」后接公司 MCP / 凭据 / 审批 / 配额；官方执行仍走控制面 + worker（D22）

## 4. 决策记录（Q1–Q28 + 定稿补记）

| # | 决策点 | 结论 |
|---|---|---|
| Q1 | 定位 | 小彼恩内部团队工具 |
| Q2 | skill 上架 | 用户提交 + 管理员审核；四态：草稿/审核中/已发布/已下架 |
| Q3 | 赞/踩用途 | 展示 + 评分排序；不做自动下架 |
| Q4 | 改稿建议流程 | 工单制，处理人逐条处理并回复 |
| Q5 | 版本管理 | 简化 semver + 历史版本 |
| Q6 | 品牌范围 | Web 随平台改；dsh 客户端商标只在 **3b 品牌安装包**验收。3a 插件打进现有 rc.2，标题仍为 DeepSeek |
| Q7 | 存储格式 | 本轮仅单文件 SKILL.md + frontmatter（扩展字段进 metadata）；附件非目标 |
| Q8 | Agent-skill 绑定 | 快照固化 + skill 发新版时给 agent 挂更新提示（混合）。定义页「最新」是快捷按钮，保存时钉死当时已发布 version |
| Q9 | 审核权 | 新权限点，不复用 Agent 审核：`skill.create`（登录即可）、`skill.review`（developer + admin）、`skill.manage`（admin：下架/代处理/改可见性）。自定义角色可被授予这些点 |
| Q10 | 所有权 | 创建人即作者；可编辑/提交新版本（仍走审核）/处理本 skill 工单；admin 兜底 |
| Q11 | 可见性 | 默认全公司共享 + 可选「仅本部门」；插件侧按 JWT 用户的部门过滤 |
| Q12 | 分类 | 轻量 tags（多对多） |
| Q13 | 评分 | Wilson 下限（贝叶斯平均），5 星制展示 |
| Q14 | 改稿锚定 | 锚定已发布版本文本（行号+原文快照），新版本发布后旧建议挂旧版本，可标「随 vX 已处理」 |
| Q15 | 绑定落点 | `AgentSpec.skills: [{ skillId, version }]`（version 必为具体 semver）。编译时：快照到 `<preset>/skills/<slug>/SKILL.md`；`agent.cordis.yml` 增补 `skill-filesystem`（`customSkillDirs` → preset 相对 `skills/`）+ `tool-skill`。现有 AgentComposer 尚无这两行，阶段 2 补 |
| Q16 | 插件认证 | **一律平台 JWT**（钉钉 OIDC 扫码，本地回调端口换票，本地存储可刷新）。删除内网免认证。dsh `trustedHosts` 只作浏览器 DNS-rebinding 围栏，不当控制面鉴权白名单 |
| Q17 | 本地冲突 | 有服务器版本号（来自服务器）→ 对比覆盖；本地自建（无版本号）→ 提示改名/跳过/强制覆盖 |
| Q18 | 品牌管线 | 3b：平台 repo 维护 branded 构建脚本，产出安装包分发。3a 只发 Cordis 插件包 |
| Q19 | 插件 UI | 侧边栏面板 + 命令行双入口 |
| Q20 | 本地应用语义 | skill → `$DSH_HOME/skills`；agent → `$DSH_HOME/.agent-presets/<name>/`。验收 = 落盘 + 本地 dsh 能发现/加载正文。不验收本地调公司 KB/数据库/审批 |
| Q21 | 编辑器 | frontmatter 字段表单 + markdown 正文 + 实时预览 |
| Q22 | 改稿交互 | 阅读模式点击句子 → 弹窗填建议+理由 |
| Q23 | 通知 | 站内通知必做（独立 `notifications` 表，阶段 1 四类事件，见 5.4）；钉钉主动消息为增强项。Agent「可更新」只做列表徽标，不进通知 |
| Q24 | 插件入口 | 侧边栏「小彼恩」区块 + 首次配置向导 + `dsh` 命令 |
| Q25 | 数据模型 | 5 张新表（skills / skill_versions / skill_feedback / change_requests / notifications）；Agent 绑定不建表 |
| Q26 | 实施顺序 | 树1 → 树2 → 树3a → 树3b。3a 依赖阶段 1（已发布 skill）；带绑定 skill 的 agent 包依赖阶段 2 |
| Q27 | 品牌素材 | 正式 logo 由品牌方提供；3b 可先用字标占位 |
| Q28 | 同步触发 | 手动刷新 + 应用/更新按钮；轮询后续可选；不做推送 |

## 5. 树1 · Skill 管理

### 5.1 生命周期与权限

- 任何登录用户可创建 skill（`skill.create`，草稿态）；提交后进入审核中；持 `skill.review`（developer/admin）审核通过 → 已发布，驳回 → 回草稿（附理由）。
- 持 `skill.manage`（admin）可下架（已下架）、代处理工单、改可见性。
- 作者权限：编辑草稿、提交新版本（仍走审核）、处理本 skill 的工单；admin 兜底代处理。
- 可见性：company（默认）/ department（可选「仅本部门」）。列表与插件均按调用者 JWT 的部门过滤。
- tags 多对多，用于浏览过滤。

### 5.2 反馈（赞/踩）

- 每用户对每 skill 一票，可改票（unique(skill_id, user_id)）。
- 评分用 Wilson 下限（防小样本噪声），展示 5 星制。
- 排序：评分为主序，反馈数、更新时间辅助；不做自动下架。

### 5.3 改稿建议（change request 工单）

- 阅读模式点击句子 → 弹窗填写建议 + 理由。
- 锚定已发布版本的文本：行号 + 原文快照（原文变化不失效，历史可追溯）。
- 状态机：open → adopted / rejected / replied（可附回复）；随新版本发布可标记「随 vX 已处理」。
- 处理人：skill 作者或持 `skill.review` / `skill.manage` 者。

### 5.4 数据模型（5 张新表，PG 迁移 016 起）

| 表 | 关键字段 |
|---|---|
| `skills` | id, slug(kebab-case, unique), title, description, owner_id, visibility(company\|department), department_id?, tags[], status(draft\|pending\|published\|archived), current_version_id?, like_count, dislike_count, score, 时间戳 |
| `skill_versions` | id, skill_id, version(semver), frontmatter(jsonb), body(SKILL.md 正文), status(pending\|published\|rejected), reviewer_id?, review_comment?, published_at?, unique(skill_id, version) |
| `skill_feedback` | id, skill_id, version_id?, user_id, kind(like\|dislike), 时间戳, unique(skill_id, user_id) |
| `change_requests` | id, skill_id, version_id, anchor{line_no, original_text}(jsonb), suggested_text, reason, requester_id, status(open\|adopted\|rejected\|replied), handler_id?, reply?, resolved_at? |
| `notifications` | id, user_id, kind, payload(jsonb), read_at?, created_at |

阶段 1 通知事件（写入 `notifications`，不复用 `audit_events`）：

| kind | 收件人 | 触发 |
|---|---|---|
| `skill.submitted` | 所有持 `skill.review` 的用户 | 作者提交审核 |
| `skill.reviewed` | 作者 | 通过或驳回 |
| `change_request.opened` | 作者 | 他人提交改稿工单 |
| `change_request.handled` | 工单提交人 | adopt / reject / reply |

Agent「可更新」阶段 2 只做列表/详情徽标，不写通知。审核/上下架/工单处理另写 `AuditStore`（管理员追查），与用户收件箱分离。

Schema 定稿（阶段 1 迁移按此，评审挂起两项已收）：① `skills.tags` 用 `text[]`（PG array），后续统计需求再拆 join 表；② 双层 status 规则——`skill_versions.status`（pending/published/rejected）为事实源，`skills.status`（draft/pending/published/archived）为冗余展示：存在任一 pending 版本 → `pending`；无 pending 且有已发布版本 → `published`；否则 `draft`；下架由 `skill.manage` 置 `archived`。

Agent 绑定不建表：`AgentSpec.skills` 字段承载，快照进 preset 包（见树2）。

### 5.5 API 划分（REST，前缀 `/api/`）

Web / 管理：

- `GET/POST /api/skills`（`skill.create`），`GET/PATCH /api/skills/:id`（作者或 `skill.manage`），`POST /api/skills/:id/submit`
- `GET /api/skills/:id/versions`，`POST /api/skills/:id/versions`，`POST /api/skills/:id/versions/:vid/review`（`skill.review`：approve/reject）
- `POST /api/skills/:id/feedback`，`GET /api/skills/:id/feedback/summary`
- `GET/POST /api/skills/:id/change-requests`，`PATCH /api/change-requests/:id`（adopt/reject/reply）
- `GET /api/notifications`，`POST /api/notifications/read`（登录用户，只看自己的）

插件（一律 `Authorization: Bearer <JWT>`，按用户部门过滤，只暴露已发布内容）：

- `GET /api/plugin/skills` — 当前用户可见的已发布 skill 列表（id、slug、version、title、description、tags、score）
- `GET /api/plugin/skills/:id` — 最新已发布版本的 SKILL.md（frontmatter + body）；本轮无附件
- `GET /api/plugin/skills/:id/versions/:vid` — 指定版本 SKILL.md（钉死 version 的 agent 重装/更新用，与 Web 侧对称）
- `GET /api/plugin/agents` — 当前用户可见的已发布 agent 列表
- `GET /api/plugin/agents/:id` — preset 包（`agent.cordis.yml` + `preset.yml` + 已快照的 `skills/<slug>/SKILL.md`）

## 6. 树2 · Agent 绑定 skills

- `AgentSpec.skills: [{ skillId, version }]`，`version` 为具体 semver。UI「最新」只把当时 `current_version` 填进去，不存 `"latest"` 活别名。
- 编译 preset 时：把指定版本的 SKILL.md 快照到 `<preset>/skills/<slug>/SKILL.md`；`agent.cordis.yml` 增加 preset 层 `skill-filesystem`（`customSkillDirs` 指向该 `skills/`）和 `tool-skill`。preset revision 完全自包含（对齐 `agent_preset_revisions`）。
- 更新提示：绑定的 skill 发布新版本 → agent 列表/详情挂「可更新」徽标 → 维护者把绑定 version 调到新版并重新发布 preset 后消除。
- UI：Agent 定义页新增「技能选择」区——搜索 + tags 过滤 + 选具体版本或「最新」（钉死）。

## 7. 树3 · dsh 客户端插件

### 7.1 插件结构（3a）

- npm 包（如 `@bienen/dsh-plugin-marketplace`），manifest 声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，经 `dsh plugin --profile <name> add` 安装。
- patch 层注册：侧边栏「小彼恩」区块、配置存储、同步服务、CLI 命令（`dsh biene market` / `dsh biene sync`）。
- 分发：内部方式（内网 npm registry 或本地包路径）。跑在员工现有 **0.1.1-rc.2** 上，无需升级客户端。

### 7.2 认证

- 首次使用配置向导：填服务器地址 → DingTalk OIDC 扫码（插件起本地回调端口 → 换 JWT → 本地存储并支持刷新）。无免认证通道。
- 后续 `/api/plugin/*` 均带 JWT；401 则重新走向导。

### 7.3 同步引擎

- 手动「刷新」拉取当前用户可见的已发布 skill / agent 列表；「应用/更新」下载后写本地。
- skill 落点：默认 `$DSH_HOME/skills`（用户级，所有项目可见），可配置。应用时在 frontmatter `metadata` 写服务器 skill_id + 版本号（更新对比依据）。
- agent 落点：`$DSH_HOME/.agent-presets/<name>/`（含快照 skills，dsh 原生加载）。
- 冲突策略：本地文件带服务器版本号 → 版本对比后覆盖升级；无版本号（本地自建）→ 提示改名 / 跳过 / 强制覆盖。
- **验收边界**：本地 dsh 能列出并加载已应用的 skill 正文（用用户自己的模型/key）；能看到已应用的 preset。不测本地调用公司 MCP/KB/数据库，不测审批与配额。官方执行仍走 Web / IM / 任务队列。

### 7.4 品牌构建管线（3b）

- 平台 repo 新增 branded 构建：`DSH_CLIENT_TITLE=小彼恩dsh` + 自定义 favicon / manifest / official 品牌插槽（小彼恩 logo 与字标，Q27 素材），保留 MIT 版权声明、去除 DeepSeek 商标。
- 产出物为安装包；正式 logo 到位前用字标占位。商标验收只卡 3b，不卡 3a。
- ✅ 已对账（结论已定）：平台 vendor 的 dsh-source 实为 **0.1.0-rc.8**（客户端 npm 为 **0.1.1-rc.2**，两条独立版本线，vendor 是更新的源码态）。**以 vendor rc.8 为唯一构建目标**：插件机制 / skill 格式 / agent presets / 端口 3080 与 rc.2 逐字节一致，按 rc.8 开发的 Cordis 插件可直接运行在员工 rc.2 上，**3a 无需员工升级**；品牌前端只能由 rc.8 构建（rc.2 仅含预构建 dist，无 vite 构建机）。唯一行为差异：`__DSH_TRANSPORT__` 页面全局为 rc.2 独有（rc.8 已移除），上传/图片体积上限 300/200 MiB → 160/100 MiB——**插件不得依赖 `__DSH_TRANSPORT__`，上传按 ≤160 MiB 设计**。

## 8. 实施阶段

| 阶段 | 内容 | 依赖 |
|---|---|---|
| 1 · skill 管理 | 5 张表迁移 + 权限点接入 13 + API + skill 管理 UI + 站内通知 | 07、13 |
| 2 · Agent 绑定 | AgentSpec.skills（钉死 version）+ Composer 补 skill-filesystem/tool-skill + 快照到 `skills/` + 定义页选择器 + 「可更新」徽标 | 阶段1、12 |
| 3a · 插件 | Cordis 插件（面板/命令/OIDC 换 JWT/同步/冲突）；打进员工 rc.2 | 阶段1（skill）；完整 agent 包要阶段2 |
| 3b · 品牌包 | vendor rc.8 branded 构建 + 安装包分发；Web 标题同步 | 3a 不阻塞；Q27 素材可字标占位 |

## 9. 验收标准（草案）

阶段 1–2（平台）：

- [ ] 员工可创建/提交 skill；持 `skill.review` 者审核后发布；驳回回草稿并通知作者
- [ ] 每 skill 有 5 星评分与排序展示
- [ ] 逐句改稿建议可提交、可处理、状态可追溯；相关方收到站内通知
- [ ] Agent 定义可选 skills（「最新」钉死 version）；preset 含 `skills/` 快照 + skill-filesystem/tool-skill，同一 revision 可复现
- [ ] 绑定 skill 发新版后 Agent 挂「可更新」，重发布后消除

阶段 3a（插件，不卡商标）：

- [ ] 未登录无法拉列表；JWT 用户只看到自己部门可见的已发布内容
- [ ] 客户端可浏览服务器 agent/skills，「应用/更新」写入约定目录，本地 dsh 能发现
- [ ] 本地自建 skill（无服务器版本号）走改名/跳过/强制覆盖，不被静默覆盖
- [ ] 不验收本地调用公司 MCP/凭据/审批

阶段 3b（品牌包）：

- [ ] 安装包标题为「小彼恩dsh」，无 DeepSeek 商标残留；保留 MIT 版权声明
- [ ] Web 门户品牌与客户端一致（字标可占位）

## 10. 待办 / 依赖

- [ ] 小彼恩正式 logo 素材（Q27，3b 可先用字标占位）
- [ ] 钉钉开放平台主动消息权限（Q23 增强项）
- [x] dsh 版本对账（7.4：已定——以 vendor 0.1.0-rc.8 为构建目标，3a 员工端无需升级）
- [x] 2026-08-31 定稿 8 题：插件 JWT、权限点、notifications 表、单文件 skill、Composer 落点、version 钉死、3a/3b 拆分、本地应用=落盘发现
- [ ] 插件目标 profile 确认（员工日常入口：dsh web(3080) 或 CLI profile；决定 `dsh plugin --profile <name>` 的 name，阶段 3a 前定）

## 11. 阶段 1 实施任务清单

前置（均已存在，直接复用）：JWT 认证（07）、RBAC 框架（13）、`PgStore` 内存回退、`AuditStore`、全局前缀 `/api`（`src/main.ts`）。实现模式对齐 `src/catalog/`（Repo 接口 + Memory/Pg 双实现）+ `src/common/permissions.ts` 权限矩阵 + 手动校验（无 class-validator）。

| # | 任务 | 落点 | 验收 |
|---|---|---|---|
| M1 | 迁移 016–019：`skills`+`skill_versions` / `skill_feedback` / `change_requests` / `notifications` | `apps/control-plane/migrations/016_skills.sql` 起，幂等 `IF NOT EXISTS`，头注释 `-- 016：…（24 工单）`，psql 手动应用 | 结构符合 §5.4（text[] tags、双层 status、unique 约束）；可重复执行 |
| M2 | 权限点：`skill.create`(employee/developer/admin)、`skill.review`(developer/admin)、`skill.manage`(admin) | `src/common/permissions.ts`（union + `PERMISSIONS`） | `can()` 单测覆盖新点 |
| M3 | 模块骨架 + Store：`SkillsRepo` 接口 + `MemorySkillsRepo`/`PgSkillsRepo` | `src/skills/{skills.module,skills.store}.ts` | DI 装配可用（`pg.pool ? Pg : Memory`） |
| M4 | Service：创建/编辑/提交审核/审核 approve-reject/发布版本/下架/反馈改票/Wilson 评分/工单状态机/部门可见性过滤/写通知 + Audit | `src/skills/skills.service.ts` | service 测试覆盖状态机、改票、可见性；Wilson 公式与「随 vX 已处理」此处定稿 |
| M5 | Controller：§5.5 Web 端点 + 插件端点 `/api/plugin/skills*`（`/api/plugin/agents*` 留阶段 2）；`@UseGuards(AuthGuard, PermissionGuard)` + `@RequirePermission` | `src/skills/skills.controller.ts` | 路由与权限矩阵核对（每端点一权限点） |
| M6 | 通知模块：表读写 + 4 类事件 + `GET/POST /api/notifications` | `src/notifications/` | 收件箱只读自己、read 幂等 |
| M7 | 前端：store-client 扩展、useApp 状态/Actions、SkillStoreView（列表/详情/编辑器/逐句建议）、审核队列、通知铃铛、hash 路由 `#skills*` | `web/store/src/`（`store-client.ts`、`useApp.ts`、新视图、`App.tsx`） | §9 阶段 1–2 验收项可手测 |
| M8 | 收尾：迁移应用步骤进 README、端到端手测、与 #22 看板协调 | `apps/control-plane/README.md` 等 | §9 清单勾选 |

顺序 M1→M8；M3–M6 可并行推进；M7 依赖 M5 的 API 形态。两个延迟决策点（Wilson→5 星公式、工单「随 vX 已处理」）在 M4 实现时定稿，不阻塞排期。

## Comments

> 2026-08-31：补全缺口 8 题已定（见 §4 对应行与 §3 非目标）。
> 2026-09-05 实施：Phase 1 M1–M8 落地。Wilson：likes=successes，`n=likes+dislikes`，`z=1.96`，score∈[0,1]；stars=`Math.round(score*50)/10`。新版本 approve 时未关闭工单 `resolvedVersion=新 semver`，status 仍为 `open`（「随 vX 已处理」）。`GET /api/plugin/skills/:id/versions/:vid` 的 `:vid` 接受版本 UUID 或钉死的 semver。
