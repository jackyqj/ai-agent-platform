# 公司级 DSH Profile（Phase 0 交付）

位置：`.scratch/ai-agent-platform/phase0/02-company-profile/`，安装到 `$DSH_HOME/profiles/company/`。

## 安装与使用

```sh
# 1. 复制到 DSH_HOME（服务端部署时 DSH_HOME 为共享目录）
cp -r .scratch/ai-agent-platform/phase0/02-company-profile/company $DSH_HOME/profiles/

# 2. 启动（开发态，从 dsh-source 源码树运行）
cd dsh-source
pnpm dsh --profile company --port 3000

# 3. 校验组合树
pnpm dsh --profile company --dump-config
```

## 文件结构

```
company/
├── package.json          # profile 清单：bundles = dsh-base + dsh-web-app
├── cordis.patch.yml      # 公司覆盖层（persona / 模型路由 / MCP / presets 根）
├── persona.md            # 统一 persona 文案（进入 cordis.patch.yml 前在此评审）
└── presets/              # 公司 Agent preset 根（Phase 2 Agent 商店的雏形）
```

## 设计要点

1. **bundles 与官方一致**：`dsh-base` + `dsh-web-app`，公司差异全在 patch 层，跟随上游零冲突。
2. **模型网关路由**：默认模型指向网关（pi-ai provider 路由），密钥走 `apiKeyEnv` 引用（D20 自建密钥服务落地后由 KMS Provider 解析）。
3. **persona 中文统一**：平台定位是员工助手（非编码 agent），persona 覆盖 coding persona。
4. **preset 根指向公司目录**：`agent-presets.config.roots` 指向 `$DSH_HOME/presets-company`（只读挂载），为 Phase 2 Agent 商店预埋。
5. **MCP 客户端行**：`mcp-*` 行按 04 工单的 Server 配置，一个 MCP Server 一行。
