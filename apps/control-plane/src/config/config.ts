// 环境配置：全部走 env，生产用 .env 或部署注入（D20 密钥服务注入优先）
export interface AppConfig {
  port: number
  jwtSecret: string
  jwtTtl: string
  authMode: 'dev' | 'oidc'
  /** OIDC（钉钉）配置——AUTH_MODE=oidc 时必填。钉钉为自定义 OAuth（无 discovery），端点硬编码在 auth.service */
  oidc: {
    clientId: string
    clientSecret: string
    redirectUri: string
    scope: string
  }
  /** 钉钉 IM 机器人（18 工单）——默认复用 OIDC 凭证；CP_IM_ENABLED 时生效 */
  dingtalk: {
    clientId: string
    clientSecret: string
    robotCode: string
  }
  /** 部门名 → 角色 映射（D12 部门标签驱动），逗号分隔：IT:developer,R&D:developer,Admin:admin */
  roleMapByDept: Record<string, string>
  /** 实例编排器：memory（开发/冒烟）| docker（生产） */
  orchestrator: 'memory' | 'docker'
  /** docker 模式：dsh-web 镜像名（02 工单公司 profile 镜像） */
  dshWebImage: string
  maxConcurrentInstances: number
  idleReapAfterMs: number
}

function csvMap(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of (raw ?? '').split(',')) {
    const [k, v] = pair.split(':')
    if (k && v) out[k.trim()] = v.trim()
  }
  return out
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.CP_PORT ?? 4000),
    jwtSecret: env.CP_JWT_SECRET ?? 'dev-secret-change-me',
    jwtTtl: env.CP_JWT_TTL ?? '2h',
    authMode: (env.CP_AUTH_MODE ?? 'dev') as AppConfig['authMode'],
    oidc: {
      clientId: env.CP_OIDC_CLIENT_ID ?? '',
      clientSecret: env.CP_OIDC_CLIENT_SECRET ?? '',
      redirectUri: env.CP_OIDC_REDIRECT_URI ?? 'http://127.0.0.1:4000/api/auth/sso/callback',
      scope: env.CP_OIDC_SCOPE ?? 'openid',
    },
    dingtalk: {
      clientId: env.CP_DINGTALK_CLIENT_ID ?? env.CP_OIDC_CLIENT_ID ?? '',
      clientSecret: env.CP_DINGTALK_CLIENT_SECRET ?? env.CP_OIDC_CLIENT_SECRET ?? '',
      robotCode: env.CP_DINGTALK_ROBOT_CODE ?? '',
    },
    roleMapByDept: csvMap(env.CP_ROLE_MAP_BY_DEPT),
    orchestrator: (env.CP_ORCHESTRATOR ?? 'memory') as AppConfig['orchestrator'],
    dshWebImage: env.CP_DSH_WEB_IMAGE ?? 'company-dsh-web:latest',
    maxConcurrentInstances: Number(env.CP_MAX_INSTANCES ?? 30),
    idleReapAfterMs: Number(env.CP_IDLE_REAP_MS ?? 30 * 60 * 1000),
  }
}
