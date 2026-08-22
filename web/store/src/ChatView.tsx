import { useState } from 'react';
import type { Actions } from './useApp';
import type { AppState } from './types';

export default function ChatView({ state, act }: { state: AppState; act: Actions }) {
  const chat = state.chat;
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);

  if (!chat) return null;

  const agentId = chat.agentId;
  const agent = state.agents.find((a) => a.id === agentId);
  const name = agent?.name ?? agentId;

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    setMessages((m) => [...m, { role: 'user', text }]);
    try {
      const reply = await act.sendMessage(agentId, text);
      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: (e as Error).message }]);
    }
    setSending(false);
  }

  return (
    <div className="chat">
      <div className="page-head">
        <button className="ghost" onClick={() => act.closeChat()}>返回商店</button>
        <h1>{name}</h1>
        <div className="sub">{agent?.description || '向助手提问'}</div>
      </div>

      {chat.error ? (
        <div className="banner warn">
          {chat.error}
          <button className="ghost small" onClick={() => void act.startChat(chat.agentId)}>重试</button>
        </div>
      ) : (
        <div className="banner ok">{chat.sessionId ? '对话已打开' : '可以开始提问'}</div>
      )}

      <div className="transcript">
        {messages.length === 0 ? (
          <div className="empty">直接输入问题。需要审批的助手会先挂起任务。</div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={'bubble ' + m.role}>
              <div className="bubble-role">{m.role === 'user' ? '我' : name}</div>
              <div>{m.text}</div>
            </div>
          ))
        )}
      </div>

      <div className="composer">
        <input
          value={draft}
          placeholder="输入问题…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
        />
        <button disabled={sending} onClick={() => void send()}>{sending ? '发送中…' : '发送'}</button>
      </div>
    </div>
  );
}
