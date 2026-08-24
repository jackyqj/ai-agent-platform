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

## 部署步骤（podman/podman-compose）

1. **GPU 节点**：Linux 宿主一台，装 NVIDIA 驱动 + Container Toolkit（配置 podman CDI）。
   D13 用户 Qwen 已部署；macOS podman machine **不支持 GPU 直通**，
   多节点/本机无 GPU 时跳过本步，走独立 Qwen 服务 + `VLLM_BASE_URL` 指向它。
2. **密钥注入**：`LITELLM_MASTER_KEY` / `DEEPSEEK_API_KEY`（**可用你自己的 DeepSeek key**）/
   可选 `DASHSCOPE_API_KEY` / `VLLM_API_KEY` 从密钥服务拉取（生产不用 `.env` 明文；
   系统服务以 env 注入，见 09 工单 KMS Provider 设计）。
3. **启动**：`podman-compose up -d litellm`（云端优先；GPU 就绪后再 `up -d vllm`）。
   端口默认 4001（`LITELLM_PORT` 可改，避开宿主 4000 控制面）。
4. **验证**：`curl http://127.0.0.1:${LITELLM_PORT:-4001}/v1/models`；云端 + 私有各跑一次 chat 完成
5. **TLS**：LiteLLM 只对 DSH 实例/运行时暴露，走内网 + 网关层互信（DSH 侧用 internal token）
6. **监控**：`/metrics` 接 Prometheus（或公司监控，D14）；用量日志落库对接 15/16

## DSH 侧接入（02 工单 profile）

pi-ai 路由注册：在 `$DSH_HOME/settings.yaml` 的 models 段配置 OpenAI 兼容端点：

```yaml
models:
  - provider: gateway
    name: private/qwen-72b
    baseUrl: http://litellm:4000/v1      # 与网关同在 podman 网络（compose 项目内）
    apiKeyEnv: GATEWAY_KEY              # 引用，密钥由凭据 Provider 解析
  - provider: gateway
    name: cloud/deepseek
    baseUrl: http://litellm:4000/v1
    apiKeyEnv: GATEWAY_KEY
```

> 若 DSH 实例与网关不在同一 compose 项目网络，baseUrl 改走宿主端口：
> `http://127.0.0.1:${LITELLM_PORT:-4001}/v1`（容器内固定 4000，宿主端口由 LITELLM_PORT 决定）。

然后 02 profile 的 `agent-default-model` 切到 `provider: gateway / model: private/qwen-72b`。

## 安全要点

- 敏感 Agent 的 preset 模型路由钉死 `private/*`；网关侧再加一层策略：
  禁止 `cloud/*` 模型接受标记为机密的请求（D18，网关路由守卫）
- 网关密钥轮换：更新环境变量 → 重启 litellm，DSH 侧零改动（引用式解析）
