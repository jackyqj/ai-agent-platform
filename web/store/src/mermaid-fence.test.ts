import { describe, expect, it } from 'vitest'
import { isMermaidSource, mermaidLangOf } from './mermaid-fence'

describe('mermaid-fence', () => {
  it('reads a mermaid language class', () => {
    expect(mermaidLangOf('language-mermaid')).toBe('mermaid')
    expect(isMermaidSource('mermaid', 'flowchart TD\nA-->B')).toBe(true)
    expect(isMermaidSource('mmd', 'graph LR\nA-->B')).toBe(true)
  })

  it('treats unlabeled flowchart fences as mermaid', () => {
    expect(isMermaidSource(undefined, 'flowchart TD\n  A([开始]) --> B[执行]')).toBe(true)
    expect(isMermaidSource('', 'sequenceDiagram\n  A->>B: hi')).toBe(true)
  })

  it('does not steal labeled non-mermaid fences', () => {
    expect(isMermaidSource('ts', 'flowchart TD\nA-->B')).toBe(false)
    expect(isMermaidSource('json', '{ "a": 1 }')).toBe(false)
  })
})
