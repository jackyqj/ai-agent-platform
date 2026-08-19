# 模型网关部署包（LiteLLM）

位置：`.scratch/ai-agent-platform/phase0/03-model-gateway/`

**依赖**：私有 vLLM 需要 GPU（D13：新购 8×A100/H100 在途）；云端 API 需要公司密钥（走 D20 自建密钥服务注入环境变量）。部署动作由平台工程师在拿到资源后执行。

## 架构

```
DSH 实例/运行时 ── OpenAI 兼容 ──> LiteLLM (master key)
                                    ├── 私有路由: vllm/qwen-72b   → http://vllm:8000/v1
                                    ├── 云端路由: deepseek/chat    → https://api.deepseek.com
                                    └── 用量日志 → 15/16 工单的计量数据源
```

## 快速开始

```sh
# 1. 准备密钥环境（生产：从密钥服务注入，见 09 工单）
export LITELLM_MASTER_KEY=sk-lm-master-<random>       # 网关管理密钥
export VLLM_API_KEY=sk-vllm-internal                  # vLLM 内部密钥
export DEEPSEEK_API_KEY=sk-...                        # 云端密钥

# 2. 启动
docker compose up -d

# 3. 验证
curl http://127.0.0.1:4000/v1/models -H "Authorization: Bearer $LITELLM_MASTER_KEY"
curl http://127.0.0.1:4000/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"private/qwen-72b","messages":[{"role":"user","content":"你好"}]}'
```

## 文件

- `docker-compose.yml` — LiteLLM + vLLM（GPU 节点）+ 健康检查
- `litellm-config.yaml` — 混合路由、模型别名、配额钩子位
- `deploy.md` — 生产部署清单（GPU 节点、密钥注入、TLS、监控）
