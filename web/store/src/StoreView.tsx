import { AGENT_SCENES, sceneLabel } from './agent-scenes';
import { type Actions } from './useApp';
import { Badge, Empty } from './ui';
import type { Agent, AppState, GraphProduct, QuotaUsage, SessionRow } from './types';

export default function StoreView({ state, act }: { state: AppState; act: Actions }) {
  const hasSidebar = state.mySessions.length > 0 || state.myApprovals.some((a) => a.status === 'pending');
  const scene = state.storeScene;
  const q = state.storeQuery.trim().toLowerCase();
  const filtered = state.agents.filter((a) => {
    if (scene && (a.scene ?? 'general') !== scene) return false;
    if (!q) return true;
    const blob = `${a.name} ${a.description} ${(a.tags ?? []).join(' ')}`.toLowerCase();
    return blob.includes(q);
  });
  const recommended = recommend(state.agents, state.favorites, state.mySessions);
  const presentScenes = new Set(state.agents.map((a) => a.scene ?? 'general'));
  const detail = state.detailAgentId ? state.agents.find((a) => a.id === state.detailAgentId) : undefined;

  return (
    <div className="store">
      <header className="store-hero">
        <p className="eyebrow">市集 · 发现</p>
        <h1>今天想让森米帮你做什么？</h1>
        <p className="lead">从市集挑一个 Agent，点开始使用就会开一条新对话。进行中的会话与待办审批在侧栏。</p>
        <QuotaBar quota={state.quota} />
      </header>

      <div className="store-filters" role="search">
        <div className="scene-chips" role="tablist" aria-label="场景">
          <button
            type="button"
            className={'scene-chip' + (!scene ? ' active' : '')}
            onClick={() => act.update({ storeScene: '' })}
          >
            全部
          </button>
          {AGENT_SCENES.filter((s) => presentScenes.has(s.id)).map((s) => (
            <button
              key={s.id}
              type="button"
              className={'scene-chip' + (scene === s.id ? ' active' : '')}
              onClick={() => act.update({ storeScene: scene === s.id ? '' : s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          className="store-search"
          placeholder="搜名称、标签…"
          value={state.storeQuery}
          onChange={(e) => act.update({ storeQuery: e.target.value })}
        />
      </div>

      <div className={'store-layout' + (hasSidebar ? '' : ' store-layout--solo')}>
        <main className="store-main">
          {recommended.length > 0 && !scene && !q ? (
            <section className="section">
              <SectionTitle title="为你推荐" meta={`${recommended.length} 个`} />
              <ul className="recommend-strip">
                {recommended.map((a) => (
                  <li key={a.id}>
                    <button type="button" className="recommend-chip" onClick={() => act.update({ detailAgentId: a.id })}>
                      <span aria-hidden="true">{a.avatar || '✨'}</span>
                      {a.name}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="section">
            <SectionTitle title="可用 Agent" meta={filtered.length ? `${filtered.length} 个` : undefined} />
            {filtered.length === 0 ? (
              <Empty>没有符合筛选的 Agent。换个场景，或请管理员开通可见范围。</Empty>
            ) : (
              <div className="agents">
                {filtered.map((a, i) => <AgentCard key={a.id} a={a} index={i} state={state} act={act} />)}
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

      {detail ? <AgentDetail a={detail} state={state} act={act} /> : null}
    </div>
  );
}

function recommend(agents: Agent[], favorites: string[], sessions: SessionRow[]): Agent[] {
  const fav = new Set(favorites);
  const recent = sessions.map((s) => s.agentPresetId);
  return agents
    .map((a) => {
      let score = 0;
      if (fav.has(a.id)) score += 100;
      score += a.favoriteCount ?? 0;
      const ri = recent.indexOf(a.id);
      if (ri >= 0) score += Math.max(0, 16 - ri);
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 4)
    .map((x) => x.a);
}

function QuotaBar({ quota }: { quota: QuotaUsage | null }) {
  if (!quota || quota.unlimited || quota.budget <= 0) return null;
  const pct = Math.min(100, Math.round((quota.used / quota.budget) * 100));
  const tight = quota.remaining <= Math.max(1, Math.floor(quota.budget * 0.15));
  const period = quota.period === 'month' ? '本月' : '今日';
  return (
    <div className={'quota-bar' + (tight ? ' quota-bar--tight' : '')} role="meter" aria-valuenow={quota.used} aria-valuemax={quota.budget} aria-label={`${period}额度`}>
      <div className="quota-bar-copy">
        <strong>{period}额度</strong>
        <span>{quota.used} / {quota.budget} 次 · 剩余 {quota.remaining}</span>
      </div>
      <div className="quota-track" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
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
      <div className="agent-avatar" aria-hidden="true">🔗</div>
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
  const starred = state.favorites.includes(a.id);
  return (
    <article className="agent motion-item" style={{ animationDelay: `${Math.min(index, 8) * 0.06}s` }}>
      <div className="agent-avatar" aria-hidden="true">{a.avatar || '✨'}</div>
      <header className="agent-head">
        <h3>
          <button type="button" className="agent-name-btn" onClick={() => act.update({ detailAgentId: a.id })}>
            {a.name}
          </button>
        </h3>
        <div className="meta">
          <Badge tone="b-cloud">{sceneLabel(a.scene)}</Badge>
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
      {(a.tags ?? []).length > 0 ? (
        <p className="agent-tags">{(a.tags ?? []).map((t) => <span key={t}>{t}</span>)}</p>
      ) : null}
      <div className="foot">
        <button className="use" disabled={!!busy} onClick={() => void act.startChat(a.id)}>{busy ? '正在打开…' : '开始使用'}</button>
        <button
          type="button"
          className={'ghost small fav-btn' + (starred ? ' fav-btn--on' : '')}
          aria-pressed={starred}
          aria-label={starred ? `取消收藏 ${a.name}` : `收藏 ${a.name}`}
          onClick={() => void act.toggleFavorite(a.id)}
        >
          {starred ? '已收藏' : '收藏'}
        </button>
        <button type="button" className="ghost small" onClick={() => act.update({ detailAgentId: a.id })}>详情</button>
      </div>
    </article>
  );
}

function AgentDetail({ a, state, act }: { a: Agent; state: AppState; act: Actions }) {
  const busy = state.agentBusy[a.id];
  const starred = state.favorites.includes(a.id);
  return (
    <div className="agent-detail-scrim" onClick={() => act.update({ detailAgentId: null })}>
      <aside className="agent-detail" role="dialog" aria-labelledby="agent-detail-title" onClick={(e) => e.stopPropagation()}>
        <div className="agent-detail-head">
          <div className="agent-avatar" aria-hidden="true">{a.avatar || '✨'}</div>
          <div>
            <p className="eyebrow">{sceneLabel(a.scene)}</p>
            <h2 id="agent-detail-title">{a.name}</h2>
          </div>
          <button className="ghost small" onClick={() => act.update({ detailAgentId: null })}>关闭</button>
        </div>
        <p className="lead">{a.description}</p>
        <ul className="agent-detail-facts">
          <li>模型 {a.modelRoute?.pinned ? '私有' : '云端'}</li>
          <li>{a.approvalLevel === 'none' ? '无需审批' : '需要审批'}</li>
          {a.knowledge ? <li>会检索知识库并标注出处</li> : null}
        </ul>
        {(a.tags ?? []).length > 0 ? (
          <p className="agent-tags">{(a.tags ?? []).map((t) => <span key={t}>{t}</span>)}</p>
        ) : null}
        <div className="foot">
          <button className="use" disabled={!!busy} onClick={() => { act.update({ detailAgentId: null }); void act.startChat(a.id); }}>
            {busy ? '正在打开…' : '开始使用'}
          </button>
          <button className="ghost" onClick={() => void act.toggleFavorite(a.id)}>{starred ? '取消收藏' : '收藏'}</button>
        </div>
      </aside>
    </div>
  );
}
