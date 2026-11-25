import { describe, expect, it } from 'vitest';
import { extractArtifacts, extractCitations, mergeCitations } from './chat-extract';

describe('extractCitations', () => {
  it('pulls 出处 lines, book titles and filenames', () => {
    const hits = extractCitations('出处：差旅制度.md\n详见《员工手册》和 handbook.pdf');
    expect(hits.map((h) => h.source)).toEqual(['差旅制度.md', '《员工手册》', 'handbook.pdf']);
  });
});

describe('extractArtifacts', () => {
  it('pulls fenced code blocks as downloadable snippets', () => {
    const arts = extractArtifacts('如下：\n```markdown\n# 回复\n您好\n```\n完');
    expect(arts).toHaveLength(1);
    expect(arts[0]?.lang).toBe('markdown');
    expect(arts[0]?.body).toContain('您好');
  });
});

describe('mergeCitations', () => {
  it('dedupes by source', () => {
    const a = extractCitations('出处：a.md');
    const b = extractCitations('出处：a.md\n出处：b.md');
    expect(mergeCitations(a, b).map((h) => h.source)).toEqual(['a.md', 'b.md']);
  });
});
