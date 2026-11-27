import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'styles.css'), 'utf8');

function block(selector: string): string {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const match = re.exec(css);
  expect(match, `missing ${selector}`).toBeTruthy();
  return match?.[1] ?? '';
}

describe('chat transcript is a bounded scrollport', () => {
  it('caps the chat grid row so the timeline can overflow', () => {
    expect(block('.chat-workbench')).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\)/);
    expect(block('.chat .transcript')).toMatch(/overflow-y:\s*auto/);
    expect(block('.chat .transcript')).toMatch(/flex:\s*1 1 0/);
    expect(block('.chat .transcript > *')).toMatch(/flex-shrink:\s*0/);
  });

  it('pins the widescreen left nav to the viewport height', () => {
    const sidebar = block('.app-sidebar');
    expect(sidebar).toMatch(/height:\s*100dvh/);
    expect(sidebar).toMatch(/max-height:\s*100dvh/);
    expect(sidebar).toMatch(/position:\s*sticky/);
    expect(sidebar).toMatch(/align-self:\s*start/);
    expect(css).toMatch(/\.shell--app\.shell--chat > \.main[\s\S]*?max-height:\s*100%/);
    expect(css).not.toMatch(/\.shell--app\.shell--chat > \*[\s\S]*?max-height:\s*100%/);
  });

  it('does not leave a transform on the chat workbench after reveal', () => {
    expect(css).toMatch(/html\.shell-ready \.main--chat > \*[\s\S]*?animation:\s*none/);
  });
});
