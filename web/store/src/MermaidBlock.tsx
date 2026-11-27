import { useEffect, useState } from 'react'
import mermaid from 'mermaid'
import CopyTextButton from './CopyTextButton'

let mermaidReady = false
let mermaidSeq = 0

function ensureMermaid(): void {
  if (mermaidReady) return
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: {
      fontFamily: '"Noto Sans SC", "PingFang SC", sans-serif',
      primaryColor: '#fff4ea',
      primaryTextColor: '#2c2416',
      primaryBorderColor: '#ef5b2b',
      lineColor: '#7a6f62',
      secondaryColor: '#ffe8dc',
      tertiaryColor: '#fff8f0',
      noteBkgColor: '#fffaf4',
      noteTextColor: '#2c2416',
    },
  })
  mermaidReady = true
}

export default function MermaidBlock({ chart }: { chart: string }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const id = `senmi-mmd-${++mermaidSeq}`
    ensureMermaid()
    void mermaid
      .render(id, chart)
      .then((result) => {
        if (!cancelled) {
          setSvg(result.svg)
          setError('')
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSvg('')
          setError(err instanceof Error ? err.message : '图无法渲染')
        }
      })
    return () => {
      cancelled = true
    }
  }, [chart])

  return (
    <figure className="md-mermaid">
      <figcaption className="md-mermaid-bar">
        <span>图示</span>
        <CopyTextButton text={chart} label="复制源码" />
      </figcaption>
      {error ? (
        <pre className="md-mermaid-error" role="note">
          {error}
          {'\n\n'}
          {chart}
        </pre>
      ) : (
        <div className="md-mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </figure>
  )
}
