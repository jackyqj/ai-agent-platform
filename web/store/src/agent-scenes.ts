export const AGENT_SCENES = [
  { id: 'general', label: '日常' },
  { id: 'hr', label: '人事' },
  { id: 'rd', label: '研发' },
  { id: 'data', label: '数据' },
  { id: 'content', label: '内容' },
  { id: 'cs', label: '客服' },
  { id: 'community', label: '社群' },
] as const;

export function sceneLabel(id: string | undefined): string {
  if (!id) return '日常';
  return AGENT_SCENES.find((s) => s.id === id)?.label ?? id;
}
