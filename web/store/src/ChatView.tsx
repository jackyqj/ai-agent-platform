import { useMemo, useState } from 'react';
import { extractArtifacts, extractCitations, mergeCitations } from './chat-extract';
import { resolveSessionTitle } from './chat-utils';
import MarkdownBody from './MarkdownBody';
import type { Actions } from './useApp';
import type { AppState, SessionRow } from './types';

export default function ChatView({ state, act }: { state: AppState; act: Actions }) {
  const chat = state.chat;
  const [draft, setDraft] = useState('');
  const messages = chat?.messages ?? [];
  const parsedCitations = useMemo(
    () => mergeCitations(chat?.citations ?? [], messages.filter((m) => m.role === 'assistant').flatMap((m) => extractCitations(m.text))),
    [chat?.citations, messages],
  );
  const artifacts = useMemo(
    () => messages.filter((m) => m.role === 'assistant').flatMap((m) => extractArtifacts(m.text)),
    [messages],
  );

  if (!chat) return null;

  const agentId = chat.agentId;
  const agent = state.agents.find((a) => a.id === agentId);
  const name = agent?.name ?? agentId;
  const sending = chat.sending ?? false;
  const title = resolveSessionTitle(name, chat.sessionId, state.sessionTitles, messages);
  const pending = state.myApprovals.filter((a) => a.status === 'pending');

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    await act.sendMessage(agentId, text);
  }

  return (
    <div className="chat-workbench">
      <div className="chat">
        <header className="page-head chat-head">
          <div className="chat-head-actions">
            <button className="ghost small" onClick={() => act.closeChat()}>回市集</button>
            {chat.sessionId ? (
              <button
                className="danger small"
                aria-label="删除对话"
                onClick={() => void act.deleteSession(chat.sessionId!)}
              >
                删除对话
              </button>
            ) : null}
          </div>
          <h1>{title}</h1>
          <p className="sub">{agent?.description || '来自市集选用 · 向 Agent 提问'}</p>
        </header>

        {chat.error ? (
          <div className="banner warn">
            {chat.error}
            <button className="ghost small" onClick={() => void act.startChat(chat.agentId)}>重试</button>
          </div>
        ) : chat.historyLoading ? (
          <div className="banner ok">正在加载历史记录…</div>
        ) : null}

        <div className="transcript">
          {!chat.historyLoading && messages.length === 0 ? (
            <div className="empty">直接输入问题。需要审批的助手会先挂起任务。</div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={'bubble ' + m.role + (m.pending ? ' pending' : '')}>
                <div className="bubble-role">{m.role === 'user' ? '我' : name}</div>
                {m.role === 'assistant' && !m.pending ? (
                  <MarkdownBody text={m.text} />
                ) : (
                  <div className="bubble-text">{m.text}</div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="composer">
          <input
            value={draft}
            placeholder="跟森米说点什么…"
            disabled={!!chat.error}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
          />
          {sending ? (
            <button className="danger" onClick={() => void act.cancelRun()}>停止</button>
          ) : (
            <button disabled={!!chat.error} onClick={() => void send()}>发送</button>
          )}
        </div>
      </div>

      <aside className="chat-rail" aria-label="对话侧栏">
        <div className={'rail-status' + (sending ? ' rail-status--busy' : '')}>
          {sending ? '运行中' : chat.error ? '待重试' : pending.length ? '等待审批' : '就绪'}
        </div>
        <section className="mini">
          <h5>当前 Agent</h5>
          <p>{name}</p>
        </section>
        {parsedCitations.length > 0 ? (
          <section className="mini">
            <h5>引用</h5>
            <ul className="rail-cite">
              {parsedCitations.slice(0, 8).map((h) => (
                <li key={h.source}>
                  <strong>{h.heading || h.source}</strong>
                  {h.snippet ? <span>{h.snippet.slice(0, 80)}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : agent?.knowledge ? (
          <section className="mini">
            <h5>引用</h5>
            <p>知识库出处会在回答后出现在这里。</p>
          </section>
        ) : null}
        {pending.length > 0 ? (
          <section className="mini">
            <h5>审批闸门 · {pending.length}</h5>
            <ul className="queue-list">
              {pending.map((a) => (
                <li key={a.id} className="queue-item">
                  <div className="queue-body">
                    <span className="queue-label">{a.action}</span>
                    <span className="queue-meta">{a.level}</span>
                  </div>
                  <button className="danger small" onClick={() => void act.cancelApproval(a.id)}>撤销</button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {artifacts.length > 0 ? (
          <section className="mini">
            <h5>工件</h5>
            <ul className="rail-cite">
              {artifacts.map((art) => (
                <li key={art.title}>
                  <strong>{art.title}</strong>
                  <span className="row" style={{ gap: 6, marginTop: 4 }}>
                    <button className="ghost small" onClick={() => void navigator.clipboard.writeText(art.body)}>复制</button>
                    <button className="ghost small" onClick={() => downloadText(art.title, art.body)}>导出</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {state.mySessions.length > 0 ? (
          <section className="mini">
            <h5>最近对话</h5>
            <ul className="rail-sessions">
              {state.mySessions.slice(0, 8).map((s) => (
                <RailSession key={s.id} s={s} activeId={chat.sessionId ?? undefined} state={state} act={act} />
              ))}
            </ul>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function downloadText(title: string, body: string) {
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = title.replace(/\s+/g, '-') + '.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function RailSession({
  s,
  activeId,
  state,
  act,
}: {
  s: SessionRow;
  activeId?: string;
  state: AppState;
  act: Actions;
}) {
  const label = state.sessionTitles[s.id] ?? state.agents.find((a) => a.id === s.agentPresetId)?.name ?? s.agentPresetId;
  const active = s.id === activeId;
  return (
    <li>
      <button
        type="button"
        className={'rail-session' + (active ? ' active' : '')}
        onClick={() => { if (!active) void act.openChat(s.id, s.agentPresetId); }}
      >
        {label}
      </button>
    </li>
  );
}
