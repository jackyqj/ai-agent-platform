# 07 反向代理 + TLS + SSO 认证网关

Status: open
Type: task
Phase: Phase 1 — 多用户与身份（第 3–6 周）
Blocked by: 06

## 背景

spec ADR-2：认证完全放在反向代理层（企业微信/钉钉/飞书 OAuth + 组织架构同步），DSH 实例只监听 loopback、由控制面转发并注入可信身份头。DSH v1 无认证层是既定事实，反代 SSO 是标准解法。

## 目标

员工通过**钉钉**（已定首选，企微/飞书为配置项）扫码登录后，所有请求带真实身份进入控制面；管理员角色来自组织架构映射。设计详见 enterprise-shell §3.1（OIDC 代理 + 平台 JWT + 服务身份）。

## 交付物

- [ ] 反向代理 + TLS（公司证书）
- [ ] SSO 对接：钉钉 OIDC（已定首选，oauth2-proxy）；企微/飞书为配置项
- [ ] 组织架构同步：**全组织只读同步**（部门/成员 → 控制面用户模型，shell §4）；部门标签→角色映射：IT/研发=developer、指定部门=admin、其余=employee，本地覆盖表做例外（D12）
- [ ] 角色映射：管理员/开发者/普通员工（后续 RBAC 细化见 13）
- [ ] 平台 JWT 签发（user_id/role/dept，短时有效；shell §3.1）
- [ ] 服务身份：内部系统触发用 API Key（scope 限定，存 hash，shell §4 `api_keys` 表）
- [ ] 身份注入：控制面与 DSH 实例间可信身份头约定
- [ ] 登录态与会话管理（刷新、登出、多端）

## 验收标准

- [ ] 未登录访问全部重定向到 SSO；登录后进入个人工作区
- [ ] 组织架构变动（入职/离职/转岗）24h 内同步生效
- [ ] 离职员工立即失去平台访问权（含已开实例回收）

## Comments

> 2025-08-16：**认证骨架完成**。`phase1/control-plane/src/auth/`：
> - 平台 JWT 签发/校验 + 角色守卫（employee → admin 路由 403 实测）
> - 钉钉 OIDC 授权码流程已实现（openid-client，`CP_OIDC_*` 配置；**需钉钉应用凭证真实验证**）
> - dev 模式（`AUTH_MODE=dev`）供本地/冒烟，生产必须 oidc
> - 角色映射按 D12 部门标签驱动（`CP_ROLE_MAP_BY_DEPT` + 研发/IT 关键词兜底 + 本地覆盖）
> 2025-08-16：**服务身份 API Key 完成**。`phase1/control-plane/src/keys/`：
> - 签发（明文仅展示一次）/校验（sha256 哈希，落 PG）/scope 守卫/撤销——全链路实测：
>   正确 key+scope → 放行（含审计 task.triggered）；错误/撤销/无 key → 401；缺 scope → 403
> - 受保护示例路由 `POST /api/service/trigger`（scope=task:create，19 工单任务入口占位）
> - api_keys 表（PG）已用：明文不落库，撤销即时生效
> 2025-08-19：**钉钉 OAuth 真实验证完成（真实凭证）**。`auth.service.ts` 从通用 `openid-client` 发现式改为钉钉原生三端点流程：
> - 授权 URL：`https://login.dingtalk.com/oauth2/auth`（scope=openid + prompt=consent + **JWT 签名 state** 防 CSRF）——实测 302 正确
> - 换票：`POST /v1.0/oauth2/userAccessToken`（clientId/clientSecret/grantType）——实测直连钉钉，无效 code 透传「不合法的临时授权码」
> - 用户信息：`GET /v1.0/contact/users/me`（unionId/nick）——身份键 = unionId
> - callback 校验 state：伪造 state → 401「CSRF check failed」
> - `openid-client` 依赖移除
> 遗留：**浏览器真授权**（需在钉钉开发者后台配置「登录回调域名」指向控制面 `/api/auth/sso/callback`）、组织架构定时同步（部门→角色仍走 D12 关键词/覆盖表）。

> 2025-08-19（二）：**浏览器真授权打通**。回调域名配 `127.0.0.1:4000` → 扫码 → 回调 → 换票 → 用户信息 → JWT 全通。
> - 期间发现 `users/me` 需「通讯录个人信息读权限」（未开通 403）→ 降级老版免登接口 `oapi.dingtalk.com/user/getuserinfo`（免登默认可用），已验证拿到真实 unionId + 昵称（审计 `mode=oidc` + 新用户落库）
> - 遗留：组织架构定时同步（部门→角色仍走 D12 关键词/覆盖表）
