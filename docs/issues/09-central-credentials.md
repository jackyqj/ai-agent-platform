# 09 集中凭据 Provider（KMS 对接）

Status: open
Type: task
Phase: Phase 1 — 多用户与身份（第 3–6 周）
Blocked by: 01

## 背景

spec §2.2：`dsh-credentials` 是引用式凭据缝（配置只存 `apiKeyEnv` 引用，`resolve()` 每次操作即时解析，绝不缓存）；现实现 `dsh-credentials-local` 读环境 + 本地 `.credentials.yaml`，无 vault。能力缝形状已为 keyring/KMS 后端留好（research-report §3）。**已定（D20）：自建轻量密钥服务**——PG 加密存储起步（主密钥由环境/启动密钥保护），实现为 `dsh-credentials` 的新 Provider；不依赖公司 KMS。

## 目标

按能力缝实现集中凭据 Provider：密钥存公司 secret 服务/KMS，DSH 各实例按引用即时解析，密钥轮换零配置变更。

## 交付物

- [x] PG 加密 vault（AES-256-GCM）+ 控制面 `SecretsService`（resolve/describe/set/unset，不缓存）
- [x] 启动 bootstrap：`.env` 的 `DS_API_KEY` → `DEEPSEEK_API_KEY`、`CP_OIDC_CLIENT_SECRET`（已有则不覆盖）
- [x] Admin API：`GET/PUT/DELETE /api/admin/secrets`（列表永不返回明文；set/unset 写审计）
- [x] Worker 按任务从 vault 解密模型密钥；钉钉 SSO/IM 换票走 vault
- [x] DSH `dsh-credentials-pg` 运行时 Provider（worker 与公司 profile 按请求 resolve）
- [x] MCP / 模型密钥引用化（`apiKeyEnv` / `EMBED_API_KEY` 从 vault 解析；网关密钥等 03 部署）
- [x] 交互容器 HTTP resolve（不持主密钥；`GET /api/internal/secrets/:ref`）

## 验收标准

- [x] 密钥明文不出现在 admin 列表/审计 payload（只记 ref）
- [x] 轮换后下一次 `resolve` / 下一任务即用新密钥
- [x] 每次 resolve 都记审计（热路径；payload 只含 ref/source，无明文）

## Comments

> 2026-08-20：**D20 v1 落地**。`apps/control-plane/src/secrets/`：AES-256-GCM + `credential_secrets` 表；主密钥 `SECRETS_MASTER_KEY`（本地回退 `CP_JWT_SECRET`）。vault 优先于 env，所以 admin 轮换立刻生效，`.env` 只作空库 bootstrap。
>
> 2026-08-20：**DSH `credentials-pg` Provider**。`dsh-source/packages/credentials/credentials-pg/` 实现 `ctx.credentials`：每请求读 vault、不缓存；worker.cordis.yml 与公司 profile 已挂载。MCP `EMBED_API_KEY` 同样进 vault（bootstrap + worker 注入子进程）。交互容器仍持有主密钥（HTTP resolve 路径见 README 遗留）。
>
> 2026-08-21：**HTTP resolve + 热路径审计**。交互 Web 实例不再注入 `SECRETS_MASTER_KEY`/`CP_JWT_SECRET`，改为 `CP_SECRETS_URL` + `CP_SECRETS_TOKEN`（scope `secrets:resolve`）。`GET /api/internal/secrets/:ref` 按请求解密；`credentials-pg` 在 `resolveUrl` 非空时走 HTTP、只读。每次 `SecretsService.resolve` 写 `secrets.resolve` 审计（describe 不记）。dev 模式缺省 token `cp_dev_secrets_resolve`。Worker 仍直连 PG（可信进程，resolve 不经控制面）。
