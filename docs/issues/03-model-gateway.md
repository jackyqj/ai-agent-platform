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

- [x] 私有 vLLM/Qwen 已由用户部署（GPU 就绪，2025-08-18）；网关侧**留接口**：私有路由端点/模型名走 env（`VLLM_BASE_URL`/`VLLM_MODEL`）
- [ ] 云端 API（DeepSeek/通义等）接入网关（NVIDIA 端点已用于开发，生产走 D20 密钥）
- [ ] 网关统一端点 + OpenAI 兼容协议验证（DSH 可经其跑通任务）
- [ ] 路由策略 v1：按模型名/前缀路由到私有或云端
- [ ] 密钥集中管理（环境注入/公司 secret 服务，见 09）
- [ ] 用量日志输出（每请求 model/tokens/耗时，供 15/16 使用）

## 验收标准

- [ ] DSH 通过网关完成 ≥3 个不同模型的任务，结果与直连一致
- [ ] 敏感路由（私有）与通用路由（云端）切换仅靠配置
- [ ] 用量日志落库，可按模型/小时聚合

## Comments

> 2025-08-16：**部署包完成，上线待资源**。docker-compose（LiteLLM + vLLM 8×A100 配置）+ 混合路由 config + 部署清单见 `phase0/03-model-gateway/`。阻塞：GPU 采购（D13）、云端密钥（D20 流程）。验收中「DSH 经网关跑任务」需等部署。
>
> 2025-08-18：**GPU/Qwen 已就绪（用户完成）**。网关侧私有路由改为 env 化接口（`VLLM_BASE_URL`/`VLLM_MODEL`），用户私有端点即插即用（见 `phase0/03-model-gateway/litellm-config.yaml` 与 deploy.md）。剩余：云端路由密钥、网关实际部署与「DSH 经网关跑任务」验收；**私有 Qwen 到位后可回归「模型工具调用可靠性」**（此前 NVIDIA deepseek-v4-flash 偶发编造工具输出，Qwen 系预期更稳）。
