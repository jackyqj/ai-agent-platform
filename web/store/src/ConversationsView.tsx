import { useMemo, useState } from 'react';
import type { Actions } from './useApp';
import { Empty } from './ui';
import type { AppState } from './types';

export default function ConversationsView({ state, act }: { state: AppState; act: Actions }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.mySessions.filter((s) => {
      if (!needle) return true;
      const name = state.agents.find((a) => a.id === s.agentPresetId)?.name ?? s.agentPresetId;
      const title = state.sessionTitles[s.id] ?? name;
      return `${title} ${name} ${s.status}`.toLowerCase().includes(needle);
    });
  }, [q, state.mySessions, state.agents, state.sessionTitles]);

  return (
    <div className="page-stack">
      <header className="page-head">
        <p className="eyebrow">对话</p>
        <h1>我的对话</h1>
        <p className="sub">继续上次的会话，或从市集开一条新的。</p>
      </header>
      <div className="store-filters">
        <input className="store-search" placeholder="搜对话标题…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="ghost" onClick={() => { act.update({ route: 'store' }); history.replaceState(null, '', '#store'); }}>去市集</button>
      </div>
      {rows.length === 0 ? (
        <Empty>{state.mySessions.length === 0 ? '还没有对话。去市集挑一个 Agent 开始。' : '没有匹配的对话。'}</Empty>
      ) : (
        <ul className="queue-list convo-list">
          {rows.map((s) => {
            const name = state.agents.find((a) => a.id === s.agentPresetId)?.name ?? s.agentPresetId;
            const label = state.sessionTitles[s.id] ?? name;
            return (
              <li key={s.id} className="queue-item">
                <div className="queue-body">
                  <span className="queue-label">{label}</span>
                  <span className="queue-meta">{name} · {s.status === 'active' ? '进行中' : s.status}</span>
                </div>
                <span className="row" style={{ gap: 6 }}>
                  <button className="use small" onClick={() => void act.openChat(s.id, s.agentPresetId)}>打开</button>
                  <button className="danger small" aria-label={`删除 ${label}`} onClick={() => void act.deleteSession(s.id)}>删除</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
