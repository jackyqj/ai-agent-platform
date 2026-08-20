export interface AgentModelRoute {
  id: string
  name: string
  modelRoute: { provider: string; model: string; pinned: boolean }
}

export interface ModelConfigView {
  defaultModel: string
  gateway: {
    deployed: boolean
    cloudBaseUrl: string | null
    privateBaseUrl: string | null
    privateModel: string | null
  }
  agents: Array<{
    id: string
    name: string
    provider: string
    model: string
    route: 'private' | 'cloud'
  }>
}

/** 管理后台模型配置只读视图（03 网关未部署时仍可展示当前路由） */
export function describeModelConfig(env: NodeJS.ProcessEnv, agents: AgentModelRoute[]): ModelConfigView {
  return {
    defaultModel: env.DS_API_MODEL ?? env.DSH_MODEL ?? 'deepseek-v4-flash',
    gateway: {
      deployed: Boolean(env.LITELLM_BASE_URL),
      cloudBaseUrl: env.DEEPSEEK_BASE_URL || null,
      privateBaseUrl: env.VLLM_BASE_URL || null,
      privateModel: env.VLLM_MODEL || null,
    },
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      provider: a.modelRoute.provider,
      model: a.modelRoute.model,
      route: a.modelRoute.pinned ? 'private' : 'cloud',
    })),
  }
}
