import { type Actions } from './useApp';
import { Badge, Empty } from './ui';
import type { Agent, AppState, SessionRow } from './types';

export default function StoreView({ state, act }: { state: AppState; act: Actions }) {
  return (
    <div>
      <div className="page-head">
        <h1>助手商店</h1>
        <div className="sub">选择助手后开始对话</div>
      </div>

      <MySessions state={state} act={act} />

      <section className="section">
        {state.agents.length === 0 ? (
          <Empty>暂无可用助手。若刚上架请刷新，或请管理员开通可见范围。</Empty>
        ) : (
          <div className="agents">
            {state.agents.map((a) => <AgentCard key={a.id} a={a} state={state} act={act} />)}
          </div>
        )}
      </section>

      <ProposeSection state={state} act={act} />
    </div>
  );
}

function agentName(state: AppState, presetId: string): string {
  return state.agents.find((a) => a.id === presetId)?.name ?? presetId;
}

function MySessions({ state, act }: { state: AppState; act: Actions }) {
  const rows = state.mySessions;
  if (rows.length === 0) return null;
  return (
    <section className="section">
      <h2 className="plain-head">我的对话</h2>
      <div className="session-list">
        {rows.map((s) => <SessionRowButton key={s.id} s={s} label={agentName(state, s.agentPresetId)} act={act} />)}
      </div>
    </section>
  );
}

function SessionRowButton({ s, label, act }: { s: SessionRow; label: string; act: Actions }) {
  return (
    <div className="session-row">
      <div>
        <div className="session-name">{label}</div>
        <div className="session-meta">{s.status === 'active' ? '进行中' : s.status}</div>
      </div>
      <button className="ghost" onClick={() => act.openChat(s.id, s.agentPresetId)}>
        {'继续 · ' + label}
      </button>
    </div>
  );
}

function AgentCard({ a, state, act }: { a: Agent; state: AppState; act: Actions }) {
  const busy = state.agentBusy[a.id];
  return (
    <div className="agent">
      <h3>{a.name}</h3>
      <p className="desc">{a.description}</p>
      <div className="meta">
        <Badge tone={a.modelRoute?.pinned ? 'b-private' : 'b-cloud'}>
          {a.modelRoute?.pinned ? '私有模型' : '云端模型'}
        </Badge>
        <Badge tone={a.approvalLevel === 'none' ? 'b-none' : 'b-self'}>
          {a.approvalLevel === 'none' ? '无需审批' : '需要审批'}
        </Badge>
      </div>
      <div className="foot">
        <button disabled={!!busy} onClick={() => void act.startChat(a.id)}>{busy ? '正在打开…' : '开始对话'}</button>
      </div>
    </div>
  );
}

const PRESETS = ['assistant', 'hr-assistant', 'report-builder', 'doc-search'];

function ProposeSection({ state, act }: { state: AppState; act: Actions }) {
  if (!state.showPropose) {
    return (
      <section className="section">
        <button className="ghost" onClick={() => act.update({ showPropose: true })}>申请新助手</button>
      </section>
    );
  }
  return (
    <section className="section card">
      <h2 className="plain-head">申请新助手</h2>
      <div className="row">
        <input placeholder="id（如 hr-flow）" style={{ minWidth: 110 }} value={state.pId} onChange={(e) => act.update({ pId: e.target.value })} />
        <input placeholder="名称" style={{ minWidth: 110 }} value={state.pName} onChange={(e) => act.update({ pName: e.target.value })} />
        <input placeholder="一句话描述" style={{ flex: 1 }} value={state.pDesc} onChange={(e) => act.update({ pDesc: e.target.value })} />
        <select value={state.pBased} onChange={(e) => act.update({ pBased: e.target.value })}>
          {PRESETS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <button onClick={() => void act.propose()}>提交申请</button>
        <button className="ghost" onClick={() => act.update({ showPropose: false })}>取消</button>
      </div>
    </section>
  );
}
