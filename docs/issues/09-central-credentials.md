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

- [ ] 凭据 Provider 实现（对接公司 KMS/secret 服务，接入方式见 Fog）
- [ ] 配置迁移：模型网关密钥、MCP Server 鉴权、内部 API 凭据全部引用化
- [ ] 轮换流程：换密钥不重启实例、不碰配置文件
- [ ] 权限审计：谁能引用哪个凭据、何时解析
- [ ] 本地回退策略（开发环境无 KMS 时）

## 验收标准

- [ ] 密钥明文不出现在配置/日志/会话事件（telemetry 结构性排除）
- [ ] 轮换后下一个请求即用新密钥
- [ ] 凭据解析行为全部可审计

## Comments
