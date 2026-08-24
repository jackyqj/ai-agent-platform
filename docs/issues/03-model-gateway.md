# 03 模型网关部署（混合路由）

Status: open
Type: task
Phase: Phase 0 — 地基与试点（第 1–2 周）
Blocked by: —

## 背景

spec ADR-3：模型网关统一暴露 OpenAI 兼容端点，背后私有 vLLM + 云端 API 混合路由；DSH 侧一个适配器指向网关即可（`dsh-llm-pi-ai` 已支持 OpenAI 兼容端点，或按 cookbook 写轻量适配器）。网关选型已定：**LiteLLM**（enterprise-shell §5，混合路由/配额/密钥集中开箱即用）。

## 目标

部署可用的模型网关 v1：私有模型 + 云端 API 双路由、按路由区分、密钥集中管理、基础用量日志。

## 交付物

- [x] 私有 vLLM/Qwen 已由用户部署（GPU 就绪）；网关侧**留接口**：私有路由端点/模型名走 env（`VLLM_BASE_URL`/`VLLM_MODEL`）
- [x] 云端 API 接入网关 —— **DeepSeek 已实测接入**（2026-08-23：用 `DS_API_KEY` 经 `cloud/deepseek→deepseek-v4-flash` 完整对话成功，含 usage）；通义 `cloud/qwen-plus` 配置就绪，待 `DASHSCOPE_API_KEY`
- [x] 网关统一端点 + OpenAI 兼容协议验证 —— `podman-compose up litellm` 后 `/v1/models`（3 路由）、`/v1/chat/completions`、`/health/liveliness`=200；宿主端口 4001（避开控制面 4000）
- [x] 路由策略 v1：按 `model_name` 前缀（`private/`、`cloud/`）路由到私有/云端 —— 配置驱动、云端命中正确；**私有路由未实跑**（vLLM 未起）
- [ ] 密钥集中管理（环境注入/公司 secret 服务，见 09） —— env 注入已通（`os.environ/DEEPSEEK_API_KEY`）；**`GATEWAY_KEY` 已落 D20 vault**（`credential_secrets`，`source=vault` 回读与网关 master 一致）；完整 secret 服务接线待 09
- [ ] 用量日志输出（每请求 model/tokens/耗时，供 15/16 使用） —— 响应已含 `usage`；`success_callback` 落库/聚合未启用

## 验收标准

- [ ] DSH 通过网关完成 ≥3 个不同模型的任务，结果与直连一致 —— 未做；已用网关完成 1 个云端模型（`cloud/deepseek`）
- [x] 敏感路由（私有）与通用路由（云端）切换仅靠配置 —— 配置化路由已验证（云端侧）；私有侧待 vLLM 资源
- [ ] 用量日志落库，可按模型/小时聚合 —— 未做

## Comments

> 2025-08-16：**部署包完成，上线待资源**。docker-compose（LiteLLM + vLLM 8×A100 配置）+ 混合路由 config + 部署清单见 `phase0/03-model-gateway/`。阻塞：GPU 采购（D13）、云端密钥（D20 流程）。验收中「DSH 经网关跑任务」需等部署。
>
> 2025-08-18：**GPU/Qwen 已就绪（用户完成）**。网关侧私有路由改为 env 化接口（`VLLM_BASE_URL`/`VLLM_MODEL`），用户私有端点即插即用（见 `phase0/03-model-gateway/litellm-config.yaml` 与 deploy.md）。剩余：云端路由密钥、网关实际部署与「DSH 经网关跑任务」验收；**私有 Qwen 到位后可回归「模型工具调用可靠性」**（此前 NVIDIA deepseek-v4-flash 偶发编造工具输出，Qwen 系预期更稳）。
>
> 2026-08-23：**网关已实际部署并实测通过（云端路由）**。环境：podman 6.0.2 + podman-compose 1.6.0（无 docker CLI）。改动：① 宿主端口 `LITELLM_PORT`（默认 4001）避让控制面 4000，容器内固定 4000；② GPU 由 Docker `deploy.resources.reservations.devices` 改为 podman CDI `devices: nvidia.com/gpu=all`；③ 补传 `DASHSCOPE_API_KEY`；④ `cloud/deepseek` 上游模型对齐 `DS_API_MODEL` 写死 `deepseek/deepseek-v4-flash`（**LiteLLM 不支持 `${VAR:-default}`**，传 `model` 时不要再用默认值写法）。验证：`/v1/models` 列出 3 路由；`cloud/deepseek` 完整对话成功（返回 `usage`）；用 `apps/control-plane/.env` 的 `DS_API_KEY` 作为 `DEEPSEEK_API_KEY`。遗留：DSH profile 仍走 `deepseek-official` 直连、D18 网关路由守卫未实装、用量日志回调未启用、私有路由待 vLLM。部署包已在 `configs/gateway/`（路径已从 `.scratch/...` 迁移）。
>
> 2026-08-23（安全收尾）：**网关 master key 已独立化并落 vault**。`LITELLM_MASTER_KEY` 改为独立 `sk-lm-master-<hex>`（不再复用 `DS_API_KEY`），同时身为 `GATEWAY_KEY` 存入 `credential_secrets`（经 `PUT /admin/secrets/GATEWAY_KEY`，走控制面 vault 加密；`GET /internal/secrets/GATEWAY_KEY` 回读 `source=vault` 且与运行中网关 master 一致）。验证：新 master `/v1/models`=200；旧 `DS_API_KEY` 作为网关 key=400（已分离）；`cloud/deepseek` 对话仍 200。DSH **profile**（交互端）`llm-pi-ai` 路由 `apiKeyEnv: GATEWAY_KEY` 现可正确鉴权；**任务 worker** 走 `dsh-llm-deepseek`、`apiKeyEnv: DEEPSEEK_API_KEY`，若需任务经网关需同步改为 `GATEWAY_KEY`（并将 `DEEPSEEK_BASE_URL` 指向网关）。
