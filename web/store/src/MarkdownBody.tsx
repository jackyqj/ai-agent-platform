import { Children, isValidElement, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import MermaidBlock from './MermaidBlock'
import { isMermaidSource, mermaidLangOf } from './mermaid-fence'

function nodeText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child)
      if (isValidElement<{ children?: ReactNode }>(child)) return nodeText(child.props.children)
      return ''
    })
    .join('')
    .replace(/\n$/, '')
}

function mermaidFromPre(children: ReactNode): string | undefined {
  const code = Children.toArray(children).find(
    (child) => isValidElement<{ className?: string; children?: ReactNode }>(child) && child.type === 'code',
  )
  if (!isValidElement<{ className?: string; children?: ReactNode }>(code)) return undefined
  const body = nodeText(code.props.children)
  const lang = mermaidLangOf(code.props.className)
  return isMermaidSource(lang, body) ? body : undefined
}

/** Render assistant (or any) message text as Markdown. Raw HTML is not enabled. */
export default function MarkdownBody({ text }: { text: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            const chart = mermaidFromPre(children)
            if (chart) return <MermaidBlock chart={chart} />
            return <pre>{children}</pre>
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
