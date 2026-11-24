import { useState } from 'react';
import { resolveSessionTitle } from './chat-utils';
import MarkdownBody from './MarkdownBody';
import type { Actions } from './useApp';
import type { AppState, SessionRow } from './types';

export default function ChatView({ state, act }: { state: AppState; act: Actions }) {
  const chat = state.chat;
  const [draft, setDraft] = useState('');

  if (!chat) return null;

  const agentId = chat.agentId;
  const agent = state.agents.find((a) => a.id === agentId);
  const name = agent?.name ?? agentId;
  const sending = chat.sending ?? false;
  const messages = chat.messages;
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
          <button disabled={sending || !!chat.error} onClick={() => void send()}>{sending ? '发送中…' : '发送'}</button>
        </div>
      </div>

      <aside className="chat-rail" aria-label="对话侧栏">
        <div className={'rail-status' + (sending ? ' rail-status--busy' : '')}>
          {sending ? '运行中' : chat.error ? '待重试' : '就绪'}
        </div>
        <section className="mini">
          <h5>当前 Agent</h5>
          <p>{name}</p>
        </section>
        {state.mySessions.length > 0 ? (
          <section className="mini">
            <h5>最近对话</h5>
            <ul className="rail-sessions">
              {state.mySessions.slice(0, 8).map((s) => (
                <RailSession key={s.id} s={s} activeId={chat.sessionId} state={state} act={act} />
              ))}
            </ul>
          </section>
        ) : null}
        {pending.length > 0 ? (
          <section className="mini">
            <h5>待审批 · {pending.length}</h5>
            <p>回市集侧栏可撤销未完成的审批。</p>
          </section>
        ) : null}
      </aside>
    </div>
  );
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
