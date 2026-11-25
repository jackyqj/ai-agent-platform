import { isFullAdmin } from './kb-utils';
import type { Actions } from './useApp';
import { Empty } from './ui';
import type { AppState } from './types';

export default function ApprovalsView({ state, act }: { state: AppState; act: Actions }) {
  const mine = state.myApprovals;
  const pendingMine = mine.filter((a) => a.status === 'pending');
  const admin = isFullAdmin(state.me);
  const inbox = admin ? state.approvals : [];

  return (
    <div className="page-stack">
      <header className="page-head">
        <p className="eyebrow">审批</p>
        <h1>待审批</h1>
        <p className="sub">运行闸门、自己提交的申请，都在这里处理。</p>
      </header>

      <section className="section">
        <div className="section-title">
          <h2>我提交的</h2>
          <span className="section-meta">{pendingMine.length} 条待处理</span>
        </div>
        {mine.length === 0 ? (
          <Empty>没有审批记录。</Empty>
        ) : (
          <ul className="queue-list">
            {mine.map((a) => (
              <li key={a.id} className="queue-item">
                <div className="queue-body">
                  <span className="queue-label">{a.action}</span>
                  <span className="queue-meta mono">{a.status ?? a.level}</span>
                </div>
                {a.status === 'pending' ? (
                  <button className="danger small" onClick={() => void act.cancelApproval(a.id)}>撤销</button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {admin ? (
        <section className="section">
          <div className="section-title">
            <h2>待我决定</h2>
            <span className="section-meta">{inbox.length} 条</span>
          </div>
          {inbox.length === 0 ? (
            <Empty>无待审批</Empty>
          ) : (
            <ul className="queue-list">
              {inbox.map((a) => (
                <li key={a.id} className="queue-item">
                  <div className="queue-body">
                    <span className="queue-label">{a.action}</span>
                    <span className="queue-meta mono">{a.requesterUserId} · {a.level}</span>
                  </div>
                  <span className="row" style={{ gap: 6 }}>
                    <button className="ok small" onClick={() => void act.decide(a.id, true)}>批准</button>
                    <button className="danger small" onClick={() => void act.decide(a.id, false)}>拒绝</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <ProposeSection state={state} act={act} />
    </div>
  );
}

function ProposeSection({ state, act }: { state: AppState; act: Actions }) {
  const templates = state.agents.length ? state.agents.map((a) => a.id) : ['assistant'];
  if (!state.showPropose) {
    return (
      <section className="section store-propose-collapsed">
        <button className="ghost" onClick={() => act.update({ showPropose: true })}>申请新助手</button>
      </section>
    );
  }
  return (
    <section className="section store-panel store-propose">
      <div className="section-title"><h2>申请新助手</h2></div>
      <div className="propose-form">
        <input placeholder="id（如 hr-flow）" value={state.pId} onChange={(e) => act.update({ pId: e.target.value })} />
        <input placeholder="名称" value={state.pName} onChange={(e) => act.update({ pName: e.target.value })} />
        <input placeholder="一句话描述" value={state.pDesc} onChange={(e) => act.update({ pDesc: e.target.value })} />
        <select value={state.pBased} onChange={(e) => act.update({ pBased: e.target.value })}>
          {templates.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <div className="propose-actions">
          <button onClick={() => void act.propose()}>提交申请</button>
          <button className="ghost" onClick={() => act.update({ showPropose: false })}>取消</button>
        </div>
      </div>
    </section>
  );
}
