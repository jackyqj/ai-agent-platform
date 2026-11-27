const MERMAID_LANG = new Set(['mermaid', 'mmd'])

const MERMAID_START =
  /^(?:%%[^\n]*\n)*\s*(flowchart|graph|sequenceDiagram|classDiagram|erDiagram|stateDiagram(?:-v2)?|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|sankey-beta|C4Context|C4Container|C4Component|journey)\b/

export function mermaidLangOf(className?: string): string | undefined {
  return /language-([\w-]+)/.exec(className ?? '')?.[1]?.toLowerCase()
}

export function isMermaidSource(lang: string | undefined, body: string): boolean {
  if (lang && MERMAID_LANG.has(lang.trim().toLowerCase())) return true
  if (lang?.trim()) return false
  return MERMAID_START.test(body.trim())
}
