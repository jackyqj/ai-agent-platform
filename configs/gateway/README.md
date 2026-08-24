# 模型网关部署包（LiteLLM）

位置：`configs/gateway/`（部署包）。

**运行**：`podman-compose`（podman 6.x，无 docker CLI 也能用）。私有 vLLM 需要 GPU（D13 用户已完成
Qwen 部署；macOS podman machine 不支持 GPU 直通，多节点场景用独立 Qwen 服务即可）；
云端 API 用你自己的 DeepSeek key（`DEEPSEEK_API_KEY`，见下方快速开始）走 D20 密钥服务注入，生产不落盘明文。

## 架构

```
DSH 实例/运行时 ── OpenAI 兼容 ──> LiteLLM (master key)
                                    ├── 私有路由: vllm/qwen-72b   → http://vllm:8000/v1
                                    ├── 云端路由: deepseek/chat    → https://api.deepseek.com
                                    └── 用量日志 → 15/16 工单的计量数据源
```

## 快速开始

```sh
# 0. 端口：默认 4001（避开宿主 4000 —— 控制面 NestJS 占用）。如需改端口：
export LITELLM_PORT=4001

# 1. 准备密钥环境（生产：从密钥服务注入，见 09 工单）
export LITELLM_MASTER_KEY=sk-lm-master-<random>       # 网关管理密钥
export VLLM_API_KEY=sk-vllm-internal                  # vLLM 内部密钥（有独立 Qwen 服务才需要）
export DEEPSEEK_API_KEY=sk-你的DeepSeekKey             # 云端密钥（可填你自己的 DeepSeek key）
# export DASHSCOPE_API_KEY=sk-...                     # 通义（可选，cloud/qwen-plus 路由）

# 2. 启动（仅云端路由、GPU 未就绪时用 litellm 单服务）
podman-compose up -d
# 或：podman-compose up -d litellm      # 只起网关，独立 Qwen 走 VLLM_BASE_URL

# 3. 验证（注意端口是 $LITELLM_PORT，默认 4001）
curl http://127.0.0.1:${LITELLM_PORT:-4001}/v1/models -H "Authorization: Bearer $LITELLM_MASTER_KEY"
curl http://127.0.0.1:${LITELLM_PORT:-4001}/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"cloud/deepseek","messages":[{"role":"user","content":"你好"}]}'
```

> **DSH 运行时鉴权**：网关管理密钥 `LITELLM_MASTER_KEY` 应独立（不要复用上游 `DEEPSEEK_API_KEY`）。
> DSH 侧（profile `llm-pi-ai` 的 `apiKeyEnv: GATEWAY_KEY`，或任务 worker 的 `apiKeyEnv`）走 D20 密钥服务：
> 把 `LITELLM_MASTER_KEY` 作为 `GATEWAY_KEY` 写入 vault（`PUT /admin/secrets/GATEWAY_KEY`），运行时据此鉴权。
> 网关内**上游** DeepSeek 调用用独立的 `DEEPSEEK_API_KEY`，两者分离。

## 文件

- `docker-compose.yml` — LiteLLM + vLLM（GPU 节点）+ 健康检查
- `litellm-config.yaml` — 混合路由、模型别名、配额钩子位
- `deploy.md` — 生产部署清单（GPU 节点、密钥注入、TLS、监控）
