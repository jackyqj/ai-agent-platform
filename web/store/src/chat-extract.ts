import type { KbSearchHit } from './types';

export interface ChatArtifact {
  title: string;
  body: string;
  lang?: string;
}

const SOURCE_LINE = /(?:出处|来源)[:：]\s*(.+)/g;
const BOOK_TITLE = /《([^》]+)》/g;
const FILE_NAME = /\b([\w./-]+\.(?:md|txt|pdf|docx|markdown))\b/gi;

export function extractCitations(text: string): KbSearchHit[] {
  const seen = new Set<string>();
  const hits: KbSearchHit[] = [];
  const push = (source: string, heading = '', snippet = '') => {
    const key = source.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    hits.push({ source: key, heading, snippet, score: 0, mode: 'keyword' });
  };
  for (const m of text.matchAll(SOURCE_LINE)) push(m[1] ?? '');
  for (const m of text.matchAll(BOOK_TITLE)) push(`《${m[1]}》`);
  for (const m of text.matchAll(FILE_NAME)) push(m[1] ?? '');
  return hits;
}

export function extractArtifacts(text: string): ChatArtifact[] {
  const out: ChatArtifact[] = [];
  const re = /```(\w+)?\n([\s\S]*?)```/g;
  let i = 1;
  for (const m of text.matchAll(re)) {
    const lang = m[1]?.trim();
    const body = (m[2] ?? '').replace(/\n$/, '');
    if (!body.trim()) continue;
    out.push({
      title: lang ? `片段 ${i}.${lang}` : `片段 ${i}`,
      body,
      lang,
    });
    i += 1;
  }
  return out;
}

export function mergeCitations(a: KbSearchHit[], b: KbSearchHit[]): KbSearchHit[] {
  const seen = new Set(a.map((h) => h.source));
  const out = [...a];
  for (const h of b) {
    if (seen.has(h.source)) continue;
    seen.add(h.source);
    out.push(h);
  }
  return out;
}
