import { type Actions } from './useApp';
import { Badge, Empty, RunStatusBadge } from './ui';
import { fmtTs } from './util';
import type { Agent, AppState, GraphProduct, SessionRow } from './types';

export default function StoreView({ state, act }: { state: AppState; act: Actions }) {
  const hasSidebar = state.mySessions.length > 0 || state.myApprovals.some((a) => a.status === 'pending');

  return (
    <div className="store">
      <header className="store-hero">
        <p className="eyebrow">企业试点 · 助手调度</p>
        <h1>助手商店</h1>
        <p className="lead">挑选已上架的 AI 助手开始对话。进行中的会话与待办审批在侧栏，定时任务在下方管理。</p>
      </header>

      <div className={'store-layout' + (hasSidebar ? '' : ' store-layout--solo')}>
        <main className="store-main">
          <section className="section">
            <SectionTitle title="可用助手" meta={state.agents.length ? `${state.agents.length} 个` : undefined} />
            {state.agents.length === 0 ? (
              <Empty>暂无可用助手。若刚上架请刷新，或请管理员开通可见范围。</Empty>
            ) : (
              <div className="agents">
                {state.agents.map((a, i) => <AgentCard key={a.id} a={a} index={i} state={state} act={act} />)}
              </div>
            )}
          </section>

          <section className="section">
            <SectionTitle title="组合产品" meta={state.graphs.length ? `${state.graphs.length} 个` : undefined} />
            {state.graphs.length === 0 ? (
              <Empty>暂无已上架的多智能体组合。由管理员在配置里编排并发布。</Empty>
            ) : (
              <div className="agents">
                {state.graphs.map((g, i) => <GraphCard key={g.id} g={g} index={i} state={state} act={act} />)}
              </div>
            )}
            {state.lastGraphRun ? (
              <div className="msg" style={{ marginTop: 12 }}>
                最近运行 {state.lastGraphRun.status}
                {state.lastGraphRun.error ? `：${state.lastGraphRun.error}` : ''}
                {state.lastGraphRun.result ? ` → ${state.lastGraphRun.result.slice(0, 240)}` : ''}
              </div>
            ) : null}
          </section>
        </main>

        {hasSidebar ? (
          <aside className="store-sidebar" aria-label="个人队列">
            <MySessions state={state} act={act} />
            <MyApprovals state={state} act={act} />
          </aside>
        ) : null}
      </div>

      <ScheduledSection state={state} act={act} />
      <ProposeSection state={state} act={act} />
    </div>
  );
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {meta ? <span className="section-meta">{meta}</span> : null}
    </div>
  );
}

function agentName(state: AppState, presetId: string): string {
  return state.agents.find((a) => a.id === presetId)?.name ?? presetId;
}

function MyApprovals({ state, act }: { state: AppState; act: Actions }) {
  const pend = state.myApprovals.filter((a) => a.status === 'pending');
  if (pend.length === 0) return null;
  return (
    <section className="sidebar-block">
      <SectionTitle title="待审批" meta={`${pend.length} 条`} />
      <ul className="queue-list">
        {pend.map((a) => (
          <li key={a.id} className="queue-item">
            <div className="queue-body">
              <span className="queue-label">{a.action}</span>
              <span className="queue-meta mono">
                {a.chain && a.chain.length > 1
                  ? `${a.level} · ${(a.currentLevel ?? 0) + 1}/${a.chain.length}`
                  : a.level}
              </span>
            </div>
            <button className="danger small" onClick={() => void act.cancelApproval(a.id)}>撤销</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScheduledSection({ state, act }: { state: AppState; act: Actions }) {
  const f = state.schedForm;
  return (
    <section className="section store-panel">
      <SectionTitle title="定时任务" meta={state.schedTasks.length ? `${state.schedTasks.length} 个` : undefined} />
      <div className="sched-form">
        <input placeholder="名称（如 每日早报）" value={f.name} onChange={(e) => act.setSchedForm({ name: e.target.value })} />
        <input placeholder="调度（daily 09:00 / every 30m / cron 0 9 * * 1）" value={f.schedule} onChange={(e) => act.setSchedForm({ schedule: e.target.value })} />
        <input placeholder="任务内容" value={f.template} onChange={(e) => act.setSchedForm({ template: e.target.value })} />
        <select value={f.tz} onChange={(e) => act.setSchedForm({ tz: e.target.value })}>
          <option value="Asia/Shanghai">亚洲/上海</option>
          <option value="UTC">UTC</option>
        </select>
        <button className="ok" onClick={() => void act.createScheduled()}>创建</button>
      </div>
      {state.schedTasks.length === 0 ? (
        <Empty>暂无定时任务</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>名称</th><th>调度</th><th>时区</th><th>下次</th><th>状态</th><th></th></tr></thead>
            <tbody>
              {state.schedTasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="mono">{t.schedule}</td>
                  <td className="mono">{t.timezone || '—'}</td>
                  <td className="mono">{t.nextRunAt ? fmtTs(t.nextRunAt) : '—'}</td>
                  <td><RunStatusBadge status={t.lastRunStatus ?? t.status} /></td>
                  <td>
                    <span className="row" style={{ gap: 6 }}>
                      <button className="ghost small" onClick={() => void act.runScheduled(t.id)}>运行</button>
                      <button className="ghost small" onClick={() => void act.loadSchedRuns(t.id)}>历史</button>
                      <button className="ghost small" onClick={() => void act.setScheduledStatus(t.id, t.status === 'paused' ? 'resume' : 'pause')}>
                        {t.status === 'paused' ? '恢复' : '暂停'}
                      </button>
                      <button className="danger small" onClick={() => void act.removeScheduled(t.id)}>删除</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state.schedRuns.length > 0 ? (
        <div className="msg sched-runs">
          {'最近运行：' + state.schedRuns.slice(0, 5).map((r) => `${r.status}${r.error ? ' ' + r.error.slice(0, 30) : ''} ${fmtTs(r.runAt)}`).join('；')}
        </div>
      ) : null}
    </section>
  );
}

function MySessions({ state, act }: { state: AppState; act: Actions }) {
  const rows = state.mySessions;
  if (rows.length === 0) return null;
  return (
    <section className="sidebar-block">
      <SectionTitle title="我的对话" meta={`${rows.length} 个`} />
      <ul className="queue-list">
        {rows.map((s) => {
          const label = state.sessionTitles[s.id] ?? agentName(state, s.agentPresetId);
          return <SessionRowButton key={s.id} s={s} label={label} act={act} />;
        })}
      </ul>
    </section>
  );
}

function SessionRowButton({ s, label, act }: { s: SessionRow; label: string; act: Actions }) {
  return (
    <li className="queue-item">
      <div className="queue-body">
        <span className="queue-label">{label}</span>
        <span className="queue-meta">{s.status === 'active' ? '进行中' : s.status}</span>
      </div>
      <span className="row" style={{ gap: 6 }}>
        <button className="ghost small" aria-label={`继续 ${label}`} onClick={() => void act.openChat(s.id, s.agentPresetId)}>继续</button>
        <button className="danger small" aria-label={`删除 ${label}`} onClick={() => void act.deleteSession(s.id)}>删除</button>
      </span>
    </li>
  );
}

function GraphCard({ g, index, state, act }: { g: GraphProduct; index: number; state: AppState; act: Actions }) {
  const busy = state.graphBusy[g.id];
  const task = state.graphTask[g.id] ?? '';
  return (
    <article className="agent motion-item" style={{ animationDelay: `${Math.min(index, 8) * 0.06}s` }}>
      <header className="agent-head">
        <h3>{g.name}</h3>
        <div className="meta">
          <Badge tone="b-cloud">组合</Badge>
        </div>
      </header>
      <p className="desc">{g.description || '管理员编排的多智能体流程'}</p>
      <textarea
        rows={2}
        placeholder="输入任务…"
        value={task}
        onChange={(e) => act.update({ graphTask: { ...state.graphTask, [g.id]: e.target.value } })}
      />
      <div className="foot">
        <button disabled={!!busy} onClick={() => void act.runGraph(g.id)}>{busy ? '运行中…' : '运行'}</button>
      </div>
    </article>
  );
}

function AgentCard({ a, index, state, act }: { a: Agent; index: number; state: AppState; act: Actions }) {
  const busy = state.agentBusy[a.id];
  return (
    <article className="agent motion-item" style={{ animationDelay: `${Math.min(index, 8) * 0.06}s` }}>
      <header className="agent-head">
        <h3>{a.name}</h3>
        <div className="meta">
          <Badge tone={a.modelRoute?.pinned ? 'b-private' : 'b-cloud'}>
            {a.modelRoute?.pinned ? '私有模型' : '云端模型'}
          </Badge>
          <Badge tone={a.approvalLevel === 'none' ? 'b-none' : 'b-self'}>
            {a.approvalLevel === 'none' ? '无需审批' : '需要审批'}
          </Badge>
          {(a.skillUpdates ?? []).length > 0 ? <Badge tone="b-warn">可更新</Badge> : null}
        </div>
      </header>
      <p className="desc">{a.description}</p>
      <div className="foot">
        <button disabled={!!busy} onClick={() => void act.startChat(a.id)}>{busy ? '正在打开…' : '开始对话'}</button>
      </div>
    </article>
  );
}

const PRESETS = ['assistant', 'hr-assistant', 'report-builder', 'doc-search'];

function ProposeSection({ state, act }: { state: AppState; act: Actions }) {
  if (!state.showPropose) {
    return (
      <section className="section store-propose-collapsed">
        <button className="ghost" onClick={() => act.update({ showPropose: true })}>申请新助手</button>
      </section>
    );
  }
  return (
    <section className="section store-panel store-propose">
      <SectionTitle title="申请新助手" />
      <div className="propose-form">
        <input placeholder="id（如 hr-flow）" value={state.pId} onChange={(e) => act.update({ pId: e.target.value })} />
        <input placeholder="名称" value={state.pName} onChange={(e) => act.update({ pName: e.target.value })} />
        <input placeholder="一句话描述" value={state.pDesc} onChange={(e) => act.update({ pDesc: e.target.value })} />
        <select value={state.pBased} onChange={(e) => act.update({ pBased: e.target.value })}>
          {PRESETS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <div className="propose-actions">
          <button onClick={() => void act.propose()}>提交申请</button>
          <button className="ghost" onClick={() => act.update({ showPropose: false })}>取消</button>
        </div>
      </div>
    </section>
  );
}
