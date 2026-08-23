import { useState } from 'react';
import { resolveSessionTitle } from './chat-utils';
import MarkdownBody from './MarkdownBody';
import type { Actions } from './useApp';
import type { AppState } from './types';

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

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    await act.sendMessage(agentId, text);
  }

  return (
    <div className="chat">
      <header className="page-head chat-head">
        <div className="chat-head-actions">
          <button className="ghost small" onClick={() => act.closeChat()}>返回商店</button>
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
        <p className="sub">{agent?.description || '向助手提问'}</p>
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
          placeholder="输入问题…"
          disabled={!!chat.error}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
        />
        <button disabled={sending || !!chat.error} onClick={() => void send()}>{sending ? '发送中…' : '发送'}</button>
      </div>
    </div>
  );
}
