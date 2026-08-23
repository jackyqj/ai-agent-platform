import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarkdownBody from './MarkdownBody';

describe('MarkdownBody', () => {
  it('renders headings, lists, and bold text', () => {
    render(<MarkdownBody text={'## 结论\n\n- **年假** 10 天\n- 出差按城市标准'} />);
    expect(screen.getByRole('heading', { level: 2, name: '结论' })).toBeInTheDocument();
    expect(screen.getByText('年假')).toBeInTheDocument();
    expect(screen.getByText(/出差按城市标准/)).toBeInTheDocument();
  });

  it('renders GFM tables', () => {
    render(<MarkdownBody text={'| 城市 | 补助 |\n| --- | --- |\n| 北京 | 80 |'} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('北京')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
  });

  it('does not execute raw HTML', () => {
    const { container } = render(<MarkdownBody text={'你好 <script>alert(1)</script>'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('你好');
  });
});
