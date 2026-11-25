// 市集场景：目录元数据，不进 AgentSpec / YAML。
export const AGENT_SCENE_IDS = ['general', 'hr', 'rd', 'data', 'content', 'cs', 'community'] as const

export type AgentSceneId = (typeof AGENT_SCENE_IDS)[number]

export interface AgentSceneDef {
  id: AgentSceneId
  label: string
}

export const AGENT_SCENES: AgentSceneDef[] = [
  { id: 'general', label: '日常' },
  { id: 'hr', label: '人事' },
  { id: 'rd', label: '研发' },
  { id: 'data', label: '数据' },
  { id: 'content', label: '内容' },
  { id: 'cs', label: '客服' },
  { id: 'community', label: '社群' },
]

export function isAgentSceneId(value: unknown): value is AgentSceneId {
  return typeof value === 'string' && (AGENT_SCENE_IDS as readonly string[]).includes(value)
}

export function sceneLabel(id: string): string {
  return AGENT_SCENES.find((s) => s.id === id)?.label ?? id
}
