import { useState } from 'react'

export default function CopyTextButton({
  text,
  label = '复制',
  copiedLabel = '已复制',
}: {
  text: string
  label?: string
  copiedLabel?: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button type="button" className="ghost small copy-raw" onClick={() => void copy()}>
      {copied ? copiedLabel : label}
    </button>
  )
}
