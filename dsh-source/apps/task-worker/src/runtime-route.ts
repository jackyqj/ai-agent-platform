export type RuntimeProvider = 'gateway' | 'deepseek-official'

export interface RuntimeRoute {
  provider: RuntimeProvider
  model: string
  reason: 'gateway' | 'official' | 'gateway-fallback-official'
}

export function firstNonEmpty(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return ''
}

/** LiteLLM aliases need the gateway; official DeepSeek does not understand `cloud/` ids. */
export function officialModelOf(requestedModel: string, dsApiModel: string | undefined): string {
  const requested = requestedModel.trim()
  if (requested && !requested.startsWith('cloud/') && !requested.startsWith('private/')) return requested
  const fromEnv = dsApiModel?.trim()
  if (fromEnv && !fromEnv.startsWith('cloud/') && !fromEnv.startsWith('private/')) return fromEnv
  return 'deepseek-v4-flash'
}

export function pickRuntimeRoute(opts: {
  requestedModel: string
  gatewayKey: string
  deepseekKey: string
  officialModel: string
}): RuntimeRoute {
  const model = opts.requestedModel.trim() || 'cloud/deepseek'
  const wantsGateway = model.startsWith('cloud/') || model.startsWith('private/')
  if (wantsGateway && opts.gatewayKey) {
    return { provider: 'gateway', model, reason: 'gateway' }
  }
  if (model.startsWith('private/') && !opts.gatewayKey) {
    throw new Error(
      'GATEWAY_KEY is not set; private/* models require the LiteLLM gateway. Store GATEWAY_KEY in the vault or export GATEWAY_KEY / LITELLM_MASTER_KEY.',
    )
  }
  if (wantsGateway && !opts.gatewayKey && !opts.deepseekKey) {
    throw new Error(
      'No model credential: store GATEWAY_KEY for the LiteLLM gateway, or DS_API_KEY / DEEPSEEK_API_KEY for official DeepSeek.',
    )
  }
  if (wantsGateway) {
    return {
      provider: 'deepseek-official',
      model: opts.officialModel.trim() || 'deepseek-v4-flash',
      reason: 'gateway-fallback-official',
    }
  }
  if (!opts.deepseekKey) {
    throw new Error('DEEPSEEK_API_KEY is not set. Store it in the vault or export DS_API_KEY / DEEPSEEK_API_KEY.')
  }
  return { provider: 'deepseek-official', model, reason: 'official' }
}
