import { API_HOST_DISPLAY, type Actions } from './useApp';
import { Badge, Empty, SectionHead } from './ui';
import type { Agent, AppState } from './types';

const PRESETS = ['assistant', 'hr-assistant', 'report-builder', 'doc-search'];

export default function StoreView({ state, act }: { state: AppState; act: Actions }) {
  return (
    <div>
      <div className="page-head">
        <h1>Agent 商店</h1>
        <div className="sub">
          可用 Agent <span className="token">{state.agents.length + ' · ' + API_HOST_DISPLAY}</span>
        </div>
      </div>

      <section className="section">
        {state.agents.length === 0 ? (
          <Empty>暂无可用 Agent</Empty>
        ) : (
          <div className="agents">
            {state.agents.map((a) => <AgentCard key={a.id} a={a} state={state} act={act} />)}
          </div>
        )}
      </section>

      <section className="section card">
        <SectionHead idx="PROPOSE" title="提审新 Agent（员工自建）" />
        <div className="row">
          <input placeholder="id（如 hr-flow）" style={{ minWidth: 110 }} value={state.pId} onChange={(e) => act.update({ pId: e.target.value })} />
          <input placeholder="名称" style={{ minWidth: 110 }} value={state.pName} onChange={(e) => act.update({ pName: e.target.value })} />
          <input placeholder="一句话描述" style={{ flex: 1 }} value={state.pDesc} onChange={(e) => act.update({ pDesc: e.target.value })} />
          <select value={state.pBased} onChange={(e) => act.update({ pBased: e.target.value })}>
            {PRESETS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <button onClick={() => void act.propose()}>提交提审</button>
        </div>
      </section>
    </div>
  );
}

function AgentCard({ a, state, act }: { a: Agent; state: AppState; act: Actions }) {
  const busy = state.agentBusy[a.id];
  const out = state.agentResults[a.id];
  return (
    <div className="agent">
      <h3>{a.name}</h3>
      <p className="desc">{a.description}</p>
      <div className="meta">
        <Badge tone={a.modelRoute?.pinned ? 'b-private' : 'b-cloud'}>
          <span className="dot" />
          {a.modelRoute?.model}
        </Badge>
        <Badge tone={a.approvalLevel === 'none' ? 'b-none' : 'b-self'}>审批:{a.approvalLevel}</Badge>
      </div>
      <div className="foot">
        <button onClick={() => void act.useAgent(a.id)}>{busy ? '…' : '选用'}</button>
        {out ? <div className="out">{out}</div> : null}
      </div>
    </div>
  );
}
