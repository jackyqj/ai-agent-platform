# 模型网关生产部署清单

> 前置依赖：GPU 节点（D13 采购在途）、云端 API 密钥（经 D20 密钥服务注入）、TLS 证书。

## 私有端点接口（env 化，2025-08-18）

用户已部署 GPU + Qwen 本地模型。网关的私有路由不硬编码端点，由 env 注入：

```sh
export VLLM_BASE_URL='http://<你的Qwen服务>:8000/v1'   # OpenAI 兼容端点
export VLLM_MODEL='Qwen/Qwen2.5-72B-Instruct'          # 实际模型名（或 served-model-name）
export VLLM_API_KEY='sk-vllm-internal'                 # 内部密钥（D20 流程后走密钥服务）
```

DSH 侧 profile 切私有路由时，`agent-default-model` 指向 `private/qwen-72b`（report-builder 已默认钉死该路由）。

## 部署步骤

1. **GPU 节点**：8×A100/H100 一台，装 NVIDIA 驱动 + Container Toolkit，加入公司网络
2. **密钥注入**：`LITELLM_MASTER_KEY` / `VLLM_API_KEY` / `DEEPSEEK_API_KEY` 从密钥服务拉取
   （生产不用 `.env` 文件明文；系统服务以 env 注入，见 09 工单 KMS Provider 设计）
3. **启动**：`docker compose up -d`，先 vLLM 后 LiteLLM（LiteLLM 对 vLLM 有健康依赖）
4. **验证**：`curl /v1/models`；私有 + 云端各跑一次 chat 完成
5. **TLS**：LiteLLM 只对 DSH 实例/运行时暴露，走内网 + 网关层互信（DSH 侧用 internal token）
6. **监控**：`/metrics` 接 Prometheus（或公司监控，D14）；用量日志落库对接 15/16

## DSH 侧接入（02 工单 profile）

pi-ai 路由注册：在 `$DSH_HOME/settings.yaml` 的 models 段配置 OpenAI 兼容端点：

```yaml
models:
  - provider: gateway
    name: private/qwen-72b
    baseUrl: http://litellm:4000/v1
    apiKeyEnv: GATEWAY_KEY        # 引用，密钥由凭据 Provider 解析
  - provider: gateway
    name: cloud/deepseek
    baseUrl: http://litellm:4000/v1
    apiKeyEnv: GATEWAY_KEY
```

然后 02 profile 的 `agent-default-model` 切到 `provider: gateway / model: private/qwen-72b`。

## 安全要点

- 敏感 Agent 的 preset 模型路由钉死 `private/*`；网关侧再加一层策略：
  禁止 `cloud/*` 模型接受标记为机密的请求（D18，网关路由守卫）
- 网关密钥轮换：更新环境变量 → 重启 litellm，DSH 侧零改动（引用式解析）
