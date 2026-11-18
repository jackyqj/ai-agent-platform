import { describe, it, expect } from 'vitest';
import { createClient } from './store-client';

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

function okJson(obj: unknown) {
  return { ok: true, status: 200, json: async () => obj } as unknown as Response;
}

interface FetchCall {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function stubFetch(fn: (url: string, opts?: RequestInit) => Promise<Response>) {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (url: unknown, opts?: RequestInit) => {
    const u = String(url);
    calls.push({
      url: u,
      method: opts?.method,
      headers: opts?.headers as Record<string, string> | undefined,
      body: opts?.body as string | undefined,
    });
    return fn(u, opts);
  }) as unknown as typeof fetch;
  return calls;
}

describe('store-client', () => {
  it('devLogin persists token and it flows into the auth header', async () => {
    const calls = stubFetch(async (url) => {
      if (url.includes('/auth/dev/login')) return okJson({ accessToken: 'tok123' });
      if (url.includes('/me')) return okJson({ role: 'admin' });
      throw new Error('unexpected ' + url);
    });
    const c = createClient({ baseUrl: 'http://x/api', storage: memStorage() });
    await c.devLogin('u-admin');
    await c.me();
    expect(calls[1].url).toBe('http://x/api/me');
    expect(calls[1].headers).toMatchObject({ Authorization: 'Bearer tok123' });
    expect(c.token).toBe('tok123');
  });

  it('query params drop empty/undefined values', async () => {
    let seen = '';
    stubFetch(async (url) => { seen = url; return okJson({ sessions: [] }); });
    const c = createClient({ baseUrl: 'http://x/api', storage: memStorage() });
    await c.admin.sessions({ userId: 'u1', dept: '', from: undefined });
    expect(seen).toBe('http://x/api/admin/sessions?userId=u1');
  });

  it('non-OK responses throw the server message', async () => {
    stubFetch(async () => ({ ok: false, status: 403, json: async () => ({ message: 'forbidden' }) }) as unknown as Response);
    const c = createClient({ baseUrl: 'http://x/api', storage: memStorage() });
    await expect(c.admin.users()).rejects.toThrow('forbidden');
  });

  it('non-JSON error bodies fall back to the status code', async () => {
    stubFetch(async () => ({ ok: false, status: 502, json: async () => { throw new Error('bad'); } }) as unknown as Response);
    const c = createClient({ baseUrl: 'http://x/api', storage: memStorage() });
    await expect(c.me()).rejects.toThrow('502');
  });

  it('POST bodies serialize as JSON with content-type', async () => {
    const calls = stubFetch(async () => okJson({ sessionId: 's1' }));
    const c = createClient({ baseUrl: 'http://x/api', storage: memStorage() });
    await c.createSession('assistant');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(calls[0].body).toBe(JSON.stringify({ agentPresetId: 'assistant' }));
  });

  it('submitTask posts the question and optional sessionId to /tasks', async () => {
    const calls = stubFetch(async () => okJson({ taskId: 't1', status: 'queued' }));
    const c = createClient({ baseUrl: 'http://x/api', storage: memStorage() });
    await c.submitTask('assistant', '请假制度是什么', 'sess-1');
    expect(calls[0].url).toBe('http://x/api/tasks');
    expect(calls[0].body).toBe(JSON.stringify({
      agentPresetId: 'assistant',
      task: '请假制度是什么',
      sessionId: 'sess-1',
    }));
  });

  it('closeSession posts to /sessions/:id/close', async () => {
    const calls = stubFetch(async () => okJson({ ok: true }));
    const c = createClient({ baseUrl: 'http://x/api', storage: memStorage() });
    await c.closeSession('sess-1');
    expect(calls[0].url).toBe('http://x/api/sessions/sess-1/close');
    expect(calls[0].method).toBe('POST');
  });

  it('listTasks fetches /tasks', async () => {
    let seen = '';
    stubFetch(async (url) => { seen = url; return okJson({ tasks: [] }); });
    const c = createClient({ baseUrl: 'http://x/api', storage: memStorage() });
    await c.listTasks();
    expect(seen).toBe('http://x/api/tasks');
  });

  it('listGraphs and runGraph hit the catalog routes', async () => {
    const calls = stubFetch(async (url) => {
      if (url.includes('/run')) return okJson({ run: { id: 'r', graphId: 'g', status: 'done', steps: [] } });
      return okJson({ graphs: [] });
    });
    const c = createClient({ baseUrl: 'http://x/api', storage: memStorage() });
    await c.listGraphs();
    await c.runGraph('invoice-pack', '查 INV-1');
    expect(calls[0].url).toBe('http://x/api/graphs');
    expect(calls[1].url).toBe('http://x/api/graphs/invoice-pack/run');
    expect(calls[1].body).toBe(JSON.stringify({ task: '查 INV-1' }));
  });

  it('listSkills and submitSkill hit the skill routes', async () => {
    const calls = stubFetch(async (url) => {
      if (url.includes('/submit')) return okJson({ skill: { id: 's' }, notice: 'ok' });
      return okJson({ skills: [] });
    });
    const c = createClient({ baseUrl: 'http://x/api', storage: memStorage() });
    await c.listSkills();
    await c.submitSkill('abc');
    expect(calls[0].url).toBe('http://x/api/skills');
    expect(calls[1].url).toBe('http://x/api/skills/abc/submit');
    expect(calls[1].method).toBe('POST');
  });
});
