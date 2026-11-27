import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import CopyTextButton from './CopyTextButton'

describe('CopyTextButton', () => {
  it('copies the original text verbatim', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const raw = '```mermaid\nflowchart TD\nA-->B\n```\n完'
    render(<CopyTextButton text={raw} label="复制原文" />)
    fireEvent.click(screen.getByRole('button', { name: '复制原文' }))
    expect(writeText).toHaveBeenCalledWith(raw)
    expect(await screen.findByRole('button', { name: '已复制' })).toBeInTheDocument()
  })
})
