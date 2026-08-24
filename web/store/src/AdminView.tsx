import { useState, type ReactNode } from 'react';
import { type Actions } from './useApp';
import AgentComposeView from './AgentComposeView';
import GraphComposeView from './GraphComposeView';
import { KB_ALLOWED_EXT, KB_MAX_BYTES } from './kb-utils';
import { Badge, ConfirmBar, Empty, LiveDot, LoadError, permBadge, RunStatusBadge } from './ui';
import { fmtTs, shortId } from './util';
import type { AdminPane, AppState, KbClassification, KbVisibility } from './types';

const TABS: { id: AdminPane; label: string; desc: string; hash: string }[] = [
  { id: 'workbench', label: '工作台', desc: '待办 · 用量 · 实例', hash: '#admin' },
  { id: 'config', label: '配置', desc: 'Agent · 配额 · 权限', hash: '#admin/config' },
  { id: 'kb', label: '知识库', desc: '文档 · 索引 · 试搜', hash: '#admin/kb' },
  { id: 'investigate', label: '调查', desc: '用户 · 会话 · 审计', hash: '#admin/investigate' },
];

const PRESETS = ['assistant', 'hr-assistant', 'report-builder', 'doc-search'];

const ROLES = ['employee', 'developer', 'admin'];
const PERMS = ['read-only', 'workspace-write', 'danger-full-access'];

interface Props {
  state: AppState;
  act: Actions;
  kbOnly?: boolean;
}

type Pending =
  | { kind: 'disable'; id: string; name: string }
  | { kind: 'unpublish'; id: string; name: string }
  | { kind: 'delete'; id: string; name: string }
  | { kind: 'kb-delete'; name: string }
  | { kind: 'stop'; id: string }
  | { kind: 'reap' };

export default function AdminView({ state, act, kbOnly = false }: Props) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pane = kbOnly ? 'kb' : state.adminPane;

  if (state.compose) return <AgentComposeView state={state} act={act} />;
  if (state.graphCompose) return <GraphComposeView state={state} act={act} />;

  function setPane(id: AdminPane, hash: string) {
    act.update({ adminPane: id });
    history.replaceState(null, '', hash);
  }

  function runPending() {
    if (!pending) return;
    switch (pending.kind) {
      case 'disable':
        void act.setStatus(pending.id, 'disabled');
        break;
      case 'unpublish':
        void act.toggleAgent(pending.id, 'published');
        break;
      case 'delete':
        void act.removeAgent(pending.id);
        break;
      case 'kb-delete':
        void act.deleteKb(pending.name);
        break;
      case 'stop':
        void act.stopInstance(pending.id);
        break;
      case 'reap':
        void act.reapIdle();
        break;
      default: {
        const _n: never = pending;
        return _n;
      }
    }
    setPending(null);
  }

  const kbOverwriteBar = state.kbPendingUpload ? (
    <ConfirmBar
      body={`文件「${state.kbPendingUpload.name}」已存在，确认覆盖？`}
      confirmLabel="覆盖上传"
      onConfirm={() => void act.confirmKbUpload()}
      onCancel={() => act.update({ kbPendingUpload: null })}
    />
  ) : null;

  const confirmBars = (
    <>
      {pending ? (
        <ConfirmBar
          body={confirmBody(pending)}
          confirmLabel={confirmLabel(pending)}
          onConfirm={runPending}
          onCancel={() => setPending(null)}
        />
      ) : null}
      {kbOverwriteBar}
    </>
  );

  if (kbOnly) {
    return (
      <div className="admin admin--kb-only">
        <header className="admin-hero">
          <p className="eyebrow">内容管理</p>
          <h1>知识库</h1>
          <p className="lead">维护助手可检索的制度与文档：上传、定权限、重建索引，并用试搜核对结果。</p>
        </header>
        {confirmBars}
        <div className="admin-pane">
          <KbDesk state={state} act={act} onDelete={(name) => setPending({ kind: 'kb-delete', name })} />
        </div>
      </div>
    );
  }

  return (
    <div className="admin">
      <header className="admin-hero">
        <p className="eyebrow">运维控制台</p>
        <h1>管理后台</h1>
        <p className="lead">工作台处理待办与实例，配置管目录与配额，知识库管语料，调查查会话与审计。</p>
      </header>
      <nav className="admin-tabs admin-tabs--4" role="tablist" aria-label="管理分区">
        {TABS.map((t) => (
          <a
            key={t.id}
            role="tab"
            aria-selected={pane === t.id}
            aria-label={t.label}
            href={t.hash}
            className={'admin-tab' + (pane === t.id ? ' active' : '')}
            onClick={(e) => { e.preventDefault(); setPane(t.id, t.hash); }}
          >
            <span className="admin-tab-label">{t.label}</span>
            <span className="admin-tab-desc">{t.desc}</span>
          </a>
        ))}
      </nav>

      {confirmBars}

      <div className="admin-pane" key={pane}>
        {pane === 'workbench' ? (
          <div className="admin-workbench">
            <ApprovalsSection state={state} act={act} />
            <StatsSection state={state} />
            <InstancesSection state={state} act={act} onStop={(id) => setPending({ kind: 'stop', id })} onReap={() => setPending({ kind: 'reap' })} />
          </div>
        ) : null}
        {pane === 'config' ? (
          <>
            <AgentsSection state={state} act={act} onUnpublish={(id, name) => setPending({ kind: 'unpublish', id, name })} onRemove={(id, name) => setPending({ kind: 'delete', id, name })} />
            <CatalogSection state={state} act={act} />
            <ScheduledSection state={state} />
            <QuotaSection state={state} act={act} />
            <RbacSection state={state} act={act} />
            <RolesSection state={state} act={act} />
            <ModelsSection state={state} />
          </>
        ) : null}
        {pane === 'kb' ? (
          <KbDesk state={state} act={act} onDelete={(name) => setPending({ kind: 'kb-delete', name })} />
        ) : null}
        {pane === 'investigate' ? (
          <>
            <UsersSection state={state} act={act} onDisable={(id, name) => setPending({ kind: 'disable', id, name })} />
            <SessionsInvestigate state={state} act={act} />
            <AuditSection state={state} act={act} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function AdminSection({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="section admin-panel">
      <div className="section-title">
        <h2>{title}</h2>
        {meta ? <span className="section-meta">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function confirmBody(p: Pending): string {
  switch (p.kind) {
    case 'disable':
      return `禁用 ${p.name} 会立即回收该用户的实例。`;
    case 'unpublish':
      return `下架「${p.name}」后，新会话将无法选用。存量会话不受影响。`;
    case 'delete':
      return `删除「${p.name}」会清掉定义与 preset 文件，新会话不可选。存量会话靠 DSH 保留。`;
    case 'kb-delete':
      return `删除知识库文档「${p.name}」后需重建索引才能从检索中移除向量切片。`;
    case 'stop':
      return '回收该实例会断开用户当前对话。';
    case 'reap':
      return '回收全部空闲实例。正在对话的实例不受影响。';
    default: {
      const _n: never = p;
      return _n;
    }
  }
}

function confirmLabel(p: Pending): string {
  switch (p.kind) {
    case 'disable':
      return '确认禁用';
    case 'unpublish':
      return '确认下架';
    case 'delete':
      return '确认删除';
    case 'kb-delete':
      return '确认删除文档';
    case 'stop':
      return '确认回收';
    case 'reap':
      return '确认回收空闲';
    default: {
      const _n: never = p;
      return _n;
    }
  }
}

function ApprovalsSection({ state, act }: Props) {
  const pend = state.approvals;
  return (
    <AdminSection title="待审批" meta={pend.length ? `${pend.length} 条` : undefined}>
      {pend.length === 0 ? (
        <Empty>无待审批</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>请求人</th><th>操作</th><th>级别</th><th>动作</th></tr></thead>
            <tbody>
              {pend.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{shortId(a.requesterUserId)}</td>
                  <td>{a.action}</td>
                  <td className="mono">
                    {a.chain && a.chain.length > 1 ? `manager ${(a.currentLevel ?? 0) + 1}/${a.chain.length} → ${a.chain[(a.currentLevel ?? 0)]}` : a.level}
                  </td>
                  <td>
                    <span className="row" style={{ gap: 6 }}>
                      <button className="ok small" onClick={() => void act.decide(a.id, true)}>批准</button>
                      <button className="danger small" onClick={() => void act.decide(a.id, false)}>拒绝</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminSection>
  );
}

function AgentsSection({ state, act, onUnpublish, onRemove }: Props & { onUnpublish: (id: string, name: string) => void; onRemove: (id: string, name: string) => void }) {
  const [chainDrafts, setChainDrafts] = useState<Record<string, string>>({});
  return (
    <section className="section admin-panel">
      <h2 className="plain-head">Agent 管理</h2>

      <div className="row" style={{ marginBottom: 10 }}>
        <input placeholder="id（如 hr-flow）" value={state.pId} style={{ minWidth: 110 }} onChange={(e) => act.update({ pId: e.target.value })} />
        <input placeholder="名称" value={state.pName} style={{ minWidth: 110 }} onChange={(e) => act.update({ pName: e.target.value })} />
        <input placeholder="一句话描述" value={state.pDesc} style={{ flex: 1 }} onChange={(e) => act.update({ pDesc: e.target.value })} />
        <select value={state.pBased} onChange={(e) => act.update({ pBased: e.target.value })}>
          {PRESETS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <button className="ok" onClick={() => void act.createAgent()}>新建</button>
      </div>

      {state.allAgents.length === 0 ? (
        <Empty />
      ) : (
        <div>
          {state.allAgents.map((a) => {
            const draft = chainDrafts[a.id] ?? (a.approvalChain?.join(',') || '');
            return (
              <div key={a.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span>
                  {a.name}
                  <span className="mono" style={{ color: 'var(--text-faint)' }}>{'  ' + a.id}</span>{' '}
                  <Badge tone="b-cloud">{a.status}</Badge>
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <span className="row" style={{ gap: 4 }}>
                    <input
                      placeholder="审批链（逗号分隔角色，如 developer,admin）"
                      value={draft}
                      style={{ maxWidth: 180, minWidth: 130 }}
                      onChange={(e) => setChainDrafts((m) => ({ ...m, [a.id]: e.target.value }))}
                    />
                    <button className="ghost small" onClick={() => void act.setAgentChain(a.id, draft.split(',').map((s) => s.trim()).filter(Boolean))}>链</button>
                  </span>
                  <button className="ghost small" onClick={() => void act.openCompose(a.id)}>编排</button>
                  {a.status === 'published' ? (
                    <button className="danger small" onClick={() => onUnpublish(a.id, a.name)}>下架</button>
                  ) : (
                    <button className="ok small" onClick={() => void act.toggleAgent(a.id, a.status ?? '')}>上架</button>
                  )}
                  <button className="danger small" onClick={() => onRemove(a.id, a.name)}>删除</button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CatalogSection({ state, act }: Props) {
  const cf = state.connForm;
  const tf = state.toolForm;
  const gf = state.graphForm;
  return (
    <section className="section admin-panel">
      <h2 className="plain-head">连接器 / 工具 / 组合图 <span className="hint">管理员上架，员工只选用</span></h2>
      <div className="row" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <input placeholder="连接器 id" value={cf.id} onChange={(e) => act.update({ connForm: { ...cf, id: e.target.value } })} />
        <input placeholder="名称" value={cf.name} onChange={(e) => act.update({ connForm: { ...cf, name: e.target.value } })} />
        <select value={cf.kind} onChange={(e) => act.update({ connForm: { ...cf, kind: e.target.value } })}>
          <option value="http">http</option>
          <option value="postgres">postgres</option>
        </select>
        <input placeholder="vault secretRef" value={cf.secretRef} onChange={(e) => act.update({ connForm: { ...cf, secretRef: e.target.value } })} />
        {cf.kind === 'postgres' ? (
          <input placeholder="表白名单 schema.table,…" value={cf.tables} onChange={(e) => act.update({ connForm: { ...cf, tables: e.target.value } })} />
        ) : (
          <input placeholder="https://api.example.com" value={cf.baseUrl} onChange={(e) => act.update({ connForm: { ...cf, baseUrl: e.target.value } })} />
        )}
        <button className="ok" onClick={() => void act.saveConnector()}>保存连接器</button>
      </div>
      {state.connectors.map((c) => (
        <div key={c.id} className="row" style={{ justifyContent: 'space-between', padding: '4px 0' }}>
          <span>{c.name} <span className="mono">{c.id}</span> <Badge tone="b-cloud">{c.status}</Badge></span>
          {c.status === 'published' ? null : <button className="ok small" onClick={() => void act.publishConnector(c.id)}>发布</button>}
        </div>
      ))}
      <div className="row" style={{ margin: '12px 0 8px', flexWrap: 'wrap', gap: 8 }}>
        <input placeholder="工具 id" value={tf.id} onChange={(e) => act.update({ toolForm: { ...tf, id: e.target.value } })} />
        <select value={tf.connectorId} onChange={(e) => act.update({ toolForm: { ...tf, connectorId: e.target.value } })}>
          <option value="">连接器</option>
          {state.connectors.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
        </select>
        <input placeholder="显示名" value={tf.name} onChange={(e) => act.update({ toolForm: { ...tf, name: e.target.value } })} />
        <input placeholder="HTTP path /v1/…" value={tf.path} onChange={(e) => act.update({ toolForm: { ...tf, path: e.target.value } })} />
        <button className="ok" onClick={() => void act.saveTool()}>保存工具</button>
      </div>
      {state.catalogTools.map((t) => (
        <div key={t.id} className="row" style={{ justifyContent: 'space-between', padding: '4px 0' }}>
          <span>{t.name || t.id} → {t.connectorId} <Badge tone="b-cloud">{t.status}</Badge></span>
          {t.status === 'published' ? null : <button className="ok small" onClick={() => void act.publishTool(t.id)}>发布</button>}
        </div>
      ))}
      <div className="row" style={{ margin: '12px 0 8px', flexWrap: 'wrap', gap: 8 }}>
        <input placeholder="图 id" value={gf.id} onChange={(e) => act.update({ graphForm: { ...gf, id: e.target.value } })} />
        <input placeholder="名称" value={gf.name} onChange={(e) => act.update({ graphForm: { ...gf, name: e.target.value } })} />
        <button className="ok" onClick={() => void act.saveGraphProduct()}>新建并编排</button>
      </div>
      {state.allGraphs.map((g) => (
        <div key={g.id} className="row" style={{ justifyContent: 'space-between', padding: '4px 0' }}>
          <span>{g.name} <span className="mono">{g.id}</span> <Badge tone="b-cloud">{g.status ?? 'draft'}</Badge></span>
          <span className="row" style={{ gap: 6 }}>
            <button className="ghost small" onClick={() => void act.openGraphCompose(g.id)}>编排</button>
            {g.status === 'published'
              ? <button className="danger small" onClick={() => void act.unpublishGraphProduct(g.id)}>下架</button>
              : <button className="ok small" onClick={() => void act.publishGraphProduct(g.id)}>上架</button>}
          </span>
        </div>
      ))}
    </section>
  );
}

function StatsSection({ state }: { state: AppState }) {
  const s = state.stats?.stats;
  if (!s) {
    return (
      <AdminSection title="用量">
        {state.errors.stats ? <LoadError msg={state.errors.stats} /> : <Empty>加载中…</Empty>}
      </AdminSection>
    );
  }
  return (
    <AdminSection title="用量">
      <div className="metric-grid">
        <div className="metric-tile">
          <span className="metric-value">{s.totals.tasks}</span>
          <span className="metric-label">任务</span>
        </div>
        <div className="metric-tile metric-tile--warn">
          <span className="metric-value">{s.totals.failed}</span>
          <span className="metric-label">失败</span>
        </div>
        <div className="metric-tile">
          <span className="metric-value">{s.totals.pendingApprovals}</span>
          <span className="metric-label">待审批</span>
        </div>
        {s.totals.quotaOpenAlerts ? (
          <div className="metric-tile metric-tile--alert">
            <span className="metric-value">{s.totals.quotaOpenAlerts}</span>
            <span className="metric-label">配额告警</span>
          </div>
        ) : null}
      </div>
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table>
        <thead><tr><th>助手</th><th className="num">总数</th><th className="num">失败</th></tr></thead>
        <tbody>
          {(s.tasksByAgent || []).map((a, i) => (
            <tr key={i}><td>{a.agent}</td><td className="mono num">{a.total}</td><td className="mono num">{a.failed}</td></tr>
          ))}
        </tbody>
      </table>
      </div>
      {s.recentErrors?.length ? (
        <div className="msg">{'最近失败：' + s.recentErrors.map((e) => e.id + ' ' + String(e.error || '').slice(0, 40)).join('；')}</div>
      ) : null}
    </AdminSection>
  );
}

function ScheduledSection({ state }: { state: AppState }) {
  return (
    <section className="section admin-panel">
      <h2 className="plain-head">定时任务</h2>
      {state.allSched.length === 0 ? (
        <Empty>无定时任务</Empty>
      ) : (
        <table>
          <thead><tr><th>名称</th><th>owner</th><th>调度</th><th>时区</th><th>上次</th><th>最近状态</th></tr></thead>
          <tbody>
            {state.allSched.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="mono">{shortId(t.ownerUserId)}</td>
                <td className="mono">{t.schedule}</td>
                <td className="mono">{t.timezone || '—'}</td>
                <td className="mono">{t.nextRunAt ? fmtTs(t.nextRunAt) : '—'}</td>
                <td><RunStatusBadge status={t.lastRunStatus ?? t.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2 className="plain-head" style={{ marginTop: 18 }}>执行失败 <span className="hint">{state.schedFailRuns.length + ' 条'}</span></h2>
      {state.schedFailRuns.length === 0 ? (
        <Empty>无失败</Empty>
      ) : (
        <table>
          <thead><tr><th>任务</th><th>错误</th><th>时间</th></tr></thead>
          <tbody>
            {state.schedFailRuns.map((r) => (
              <tr key={r.id}>
                <td>{r.name || shortId(r.scheduledId, 6)}</td>
                <td className="mono">{r.error || '—'}</td>
                <td className="mono">{fmtTs(r.runAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function QuotaSection({ state, act }: Props) {
  return (
    <section className="section admin-panel">
      <h2 className="plain-head">配额策略</h2>
      {state.quotas.length === 0 ? (
        <Empty>无策略</Empty>
      ) : (
        <table>
          <thead><tr><th>范围</th><th>周期</th><th>每日任务上限</th><th>超限策略</th></tr></thead>
          <tbody>
            {state.quotas.map((p, i) => (
              <tr key={i}>
                <td className="mono">{p.scopeType + ':' + (p.scopeId || 'all')}</td>
                <td className="mono">{p.period}</td>
                <td className="mono num">{p.budgetRequests}</td>
                <td className="mono">{p.overPolicy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <select value={state.qScope} onChange={(e) => act.update({ qScope: e.target.value as 'all' | 'user' | 'dept' })}>
          <option value="all">全员</option>
          <option value="user">用户</option>
          <option value="dept">部门</option>
        </select>
        <input placeholder="user/dept 时填 id / 部门名" value={state.qScopeId} style={{ flex: 1 }} onChange={(e) => act.update({ qScopeId: e.target.value })} />
        <input type="number" value={state.qBudget} min="1" style={{ width: 90 }} onChange={(e) => act.update({ qBudget: e.target.value })} />
        <button onClick={() => void act.setQuota()}>设置/更新</button>
      </div>

      <h2 className="plain-head" style={{ marginTop: 18 }}>告警 <span className="hint">{state.quotaAlerts.length + ' 条未处置'}</span></h2>
      {state.quotaAlerts.length === 0 ? (
        <Empty>无未处置告警</Empty>
      ) : (
        <table>
          <thead><tr><th>范围</th><th>用户</th><th>用量</th><th>周期</th><th>触发</th><th></th></tr></thead>
          <tbody>
            {state.quotaAlerts.map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.scopeType + ':' + (a.scopeId || 'all')}</td>
                <td className="mono">{a.userId ? shortId(a.userId) : '—'}</td>
                <td className="mono num">{a.usedRequests + '/' + a.budgetRequests}</td>
                <td className="mono">{a.period}</td>
                <td className="mono">{fmtTs(a.createdAt)}</td>
                <td>
                  <button className="ok small" onClick={() => void act.resolveQuotaAlert(a.id)}>处置</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function UsersSection({ state, act, onDisable }: Props & { onDisable: (id: string, name: string) => void }) {
  const q = state.userFilter.toLowerCase();
  const rows = state.users.filter((u) =>
    !q || u.id.toLowerCase().includes(q) || u.name.toLowerCase().includes(q) || (u.dept || '').toLowerCase().includes(q));
  return (
    <section className="section admin-panel">
      <h2 className="plain-head">用户 <span className="hint">{state.users.length + ' 人'}</span></h2>
      <div className="row" style={{ marginBottom: 8 }}>
        <input placeholder="筛姓名 / 部门 / id" value={state.userFilter} onChange={(e) => act.update({ userFilter: e.target.value })} />
      </div>
      {rows.length === 0 ? (
        <Empty>无用户</Empty>
      ) : (
        <table>
          <thead><tr><th>id</th><th>姓名</th><th>部门</th><th>角色</th><th>沙箱</th><th>状态</th><th></th></tr></thead>
          <tbody>
            {rows.map((u) => {
              const edit = state.userEdits[u.id] ?? { dept: u.dept || '', role: u.role };
              return (
                <tr key={u.id}>
                  <td className="mono">{u.id}</td>
                  <td>{u.name}</td>
                  <td><input value={edit.dept} style={{ minWidth: 100 }} onChange={(e) => act.editUser(u.id, { dept: e.target.value })} /></td>
                  <td>
                    <select value={edit.role} onChange={(e) => act.editUser(u.id, { role: e.target.value })}>
                      {[...ROLES, ...state.roleDefs.map((r) => r.name)].map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td><Badge tone={permBadge(u.permissionMode)}>{u.permissionMode || '—'}</Badge></td>
                  <td><Badge tone={u.status === 'active' ? 'b-ok' : 'b-off'}>{u.status}</Badge></td>
                  <td>
                    <span className="row" style={{ gap: 6 }}>
                      <button className="ghost small" onClick={() => act.focusUser(u.id)}>会话</button>
                      <button className="ghost small" onClick={() => void act.saveUser(u.id)}>保存</button>
                      {u.status === 'active' ? (
                        <button className="danger small" onClick={() => onDisable(u.id, u.name)}>禁用</button>
                      ) : (
                        <button className="ok small" onClick={() => void act.setStatus(u.id, 'active')}>启用</button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function SessionsInvestigate({ state, act }: Props) {
  return (
    <section className="section admin-panel">
      <h2 className="plain-head">会话与事件</h2>
      <div className="row" style={{ marginBottom: 8 }}>
        <input placeholder="userId" value={state.sessUser} onChange={(e) => act.update({ sessUser: e.target.value })} />
        <input placeholder="部门（精确）" value={state.sessDept} onChange={(e) => act.update({ sessDept: e.target.value })} />
        <input type="datetime-local" value={state.sessFrom} onChange={(e) => act.update({ sessFrom: e.target.value })} />
        <button onClick={() => void act.loadSessions()}>检索</button>
        <button className="ghost" onClick={() => act.clearSessionFilter()}>清空</button>
      </div>
      <div className="split">
        <div>
          {state.sessions.length === 0 ? (
            <Empty>无会话</Empty>
          ) : (
            <table>
              <thead><tr><th>会话</th><th>用户</th><th>部门</th><th>助手</th><th>状态</th><th>创建</th></tr></thead>
              <tbody>
                {state.sessions.map((s) => (
                  <tr
                    key={s.id}
                    className={'clickable' + (s.id === state.selectedSessionId ? ' selected' : '')}
                    onClick={() => void act.openSession(s.id)}
                  >
                    <td className="mono">{shortId(s.id)}</td>
                    <td>{s.userName || s.userId}</td>
                    <td>{s.dept || ''}</td>
                    <td className="mono">{s.agentPresetId}</td>
                    <td>{s.status}</td>
                    <td className="mono">{fmtTs(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <EventsPane state={state} />
      </div>
    </section>
  );
}

function EventsPane({ state }: { state: AppState }) {
  const d = state.sessionDetail;
  if (!d) return <Empty>在左侧点一行会话</Empty>;
  return (
    <div>
      <div className="detail">
        {'会话 ' + d.session.id + ' · ' + (d.session.userId || '') + ' · ' + (d.session.agentPresetId || '') + ' · ' + (d.session.status || '')}
      </div>
      {d.err
        ? <div className="msg" style={{ color: 'var(--danger)' }}>读取失败：{d.err}</div>
        : <pre className="payload">{d.ev || '无事件'}</pre>}
    </div>
  );
}

function InstancesSection({ state, act, onStop, onReap }: Props & { onStop: (id: string) => void; onReap: () => void }) {
  const r = state.instances;
  return (
    <AdminSection title="实例" meta={r ? `live ${r.count}` : undefined}>
      <div className="row admin-toolbar">
        <LiveDot active={(r?.count ?? 0) > 0} />
        <button className="ghost small" onClick={() => void act.loadAdminData()}>刷新</button>
        <button className="danger small" onClick={onReap}>回收空闲</button>
      </div>
      {!r ? (
        state.errors.instances ? <LoadError msg={state.errors.instances} /> : <Empty>加载中…</Empty>
      ) : r.instances.length === 0 ? (
        <Empty>无实例</Empty>
      ) : (
        <div className="table-wrap">
          <table>
              <thead><tr><th>id</th><th>用户</th><th>地址</th><th>状态</th><th>心跳</th><th></th></tr></thead>
              <tbody>
                {r.instances.map((i) => (
                  <tr key={i.id}>
                    <td className="mono">{shortId(i.id)}</td>
                    <td className="mono">{i.userId || ''}</td>
                    <td className="mono">{i.host + ':' + i.port}</td>
                    <td><Badge tone={i.status === 'dead' ? 'b-off' : 'b-ok'}>{i.status}</Badge></td>
                    <td className="mono">{fmtTs(i.lastHeartbeat)}</td>
                    <td>{i.status === 'dead' ? '' : <button className="danger small" onClick={() => onStop(i.id)}>回收</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      )}
    </AdminSection>
  );
}

function RbacSection({ state, act }: Props) {
  const r = state.rbac;
  const overlays = r ? Object.entries(r.deptOverlays || {}) : [];
  return (
    <section className="section admin-panel">
      <h2 className="plain-head">权限</h2>
      <div className="msg" style={{ margin: '0 0 8px' }}>
        角色默认：员工 workspace-write；开发者/管理员 danger-full-access。新会话生效，改角色会回收旧实例。
      </div>
      {!r ? (
        state.errors.rbac ? <LoadError msg={state.errors.rbac} /> : <Empty>加载中…</Empty>
      ) : overlays.length === 0 ? (
        <Empty>无覆盖（继承角色）</Empty>
      ) : (
        <table>
          <thead><tr><th>部门覆盖</th><th>preset</th></tr></thead>
          <tbody>
            {overlays.map(([d, p]) => <tr key={d}><td className="mono">{d}</td><td className="mono">{p}</td></tr>)}
          </tbody>
        </table>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <input placeholder="部门名（如 业务部）" value={state.ovDept} onChange={(e) => act.update({ ovDept: e.target.value })} />
        <select value={state.ovPreset} onChange={(e) => act.update({ ovPreset: e.target.value })}>
          {PERMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={() => void act.saveOverlay()}>设置部门覆盖</button>
        <button className="ghost" onClick={() => void act.clearOverlay()}>清除覆盖</button>
      </div>
    </section>
  );
}

function RolesSection({ state, act }: Props) {
  const f = state.roleForm;
  const options = state.permKeys.length ? state.permKeys : [];
  return (
    <section className="section admin-panel">
      <h2 className="plain-head">角色 <span className="hint">自定义角色（权限点组合 + DSH 沙箱）</span></h2>
      {state.roleDefs.length === 0 ? (
        <Empty>无自定义角色（预置 employee/developer/admin）</Empty>
      ) : (
        <table>
          <thead><tr><th>名称</th><th>权限</th><th>沙箱</th><th></th></tr></thead>
          <tbody>
            {state.roleDefs.map((r) => (
              <tr key={r.name}>
                <td className="mono">{r.name}</td>
                <td className="mono">{r.permissions.join(', ') || '—'}</td>
                <td className="mono">{r.dshPreset}</td>
                <td><button className="danger small" onClick={() => void act.removeRole(r.name)}>删除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
        <input placeholder="角色名（如 report-viewer）" value={f.name} style={{ minWidth: 150 }} onChange={(e) => act.setRoleForm({ name: e.target.value })} />
        <select value={f.dshPreset} onChange={(e) => act.setRoleForm({ dshPreset: e.target.value })}>
          {(state.presetKeys.length ? state.presetKeys : []).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="ok" onClick={() => void act.upsertRole()}>保存</button>
      </div>
      <div className="perms" style={{ marginTop: 8 }}>
        {options.map((p) => (
          <label key={p} className="row" style={{ gap: 4, marginRight: 10 }}>
            <input
              type="checkbox"
              checked={f.permissions.includes(p)}
              onChange={(e) =>
                act.setRoleForm({
                  permissions: e.target.checked ? [...f.permissions, p] : f.permissions.filter((x) => x !== p),
                })
              }
            />
            <span className="mono">{p}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function KbDesk({ state, act, onDelete }: Props & { onDelete: (name: string) => void }) {
  const st = state.kbStatus;
  const [editName, setEditName] = useState<string | null>(null);
  const [editVis, setEditVis] = useState<KbVisibility>({ classification: 'internal', departments: ['*'], roles: [] });

  function startEdit(name: string, vis: KbVisibility) {
    setEditName(name);
    setEditVis({ ...vis, departments: [...vis.departments], roles: [...vis.roles] });
  }

  return (
    <div className="kb-desk">
      <AdminSection title="索引状态" meta={st?.ingestRunning ? '重建中' : undefined}>
        {state.errors.kb ? <LoadError msg={state.errors.kb} /> : null}
        <div className="metric-grid kb-metrics">
          <div className="metric-tile">
            <span className="metric-value">{st ? st.documentCount : '—'}</span>
            <span className="metric-label">文档</span>
          </div>
          <div className="metric-tile">
            <span className="metric-value">{st ? st.chunkCount : '—'}</span>
            <span className="metric-label">切片</span>
          </div>
          <div className={'metric-tile' + (st?.ingestRunning ? ' metric-tile--warn' : '')}>
            <span className="metric-value mono" style={{ fontSize: 'var(--text-base)' }}>
              {st?.ingestRunning ? '重建中' : (st?.indexModel || '未索引')}
            </span>
            <span className="metric-label">{st?.lastIngestAt ? '上次 ' + fmtTs(st.lastIngestAt) : '索引模型'}</span>
          </div>
        </div>
        <div className="admin-toolbar kb-toolbar">
          <button className="ok" onClick={() => void act.triggerKbIngest()} disabled={st?.ingestRunning}>
            {st?.ingestRunning ? '正在重建…' : '重建索引'}
          </button>
          {st?.ingestError ? <span className="msg err">{st.ingestError}</span> : null}
        </div>
        {st?.ingestLog && st.ingestLog.length > 0 ? (
          <pre className="mono ingest-log">{st.ingestLog.join('\n')}</pre>
        ) : null}
      </AdminSection>

      <AdminSection title="文档" meta={state.kbDocuments.length ? `${state.kbDocuments.length} 篇` : undefined}>
        <div className="kb-upload">
          <label className="kb-upload-field">
            <span className="kb-upload-label">上传文件</span>
            <input
              type="file"
              accept={KB_ALLOWED_EXT.join(',')}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void act.uploadKb(f);
                e.target.value = '';
              }}
            />
          </label>
          <label className="kb-upload-field">
            <span className="kb-upload-label">默认分级</span>
            <select value={state.kbUploadClass} onChange={(e) => act.update({ kbUploadClass: e.target.value as KbClassification })}>
              <option value="public">public</option>
              <option value="internal">internal</option>
              <option value="confidential">confidential</option>
            </select>
          </label>
          <p className="hint kb-upload-hint">
            {'支持 ' + KB_ALLOWED_EXT.join('、') + '，单文件不超过 ' + Math.round(KB_MAX_BYTES / 1024 / 1024) + 'MB'}
          </p>
        </div>

        {state.kbDocuments.length === 0 ? (
          <Empty>暂无文档。上传后记得重建索引。</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>文件名</th><th>格式</th><th>分级</th><th>部门</th><th>索引</th><th></th></tr></thead>
              <tbody>
                {state.kbDocuments.map((d) => (
                  <tr key={d.name}>
                    <td className="mono">{d.name}</td>
                    <td className="mono">{d.format}</td>
                    <td>
                      <Badge tone={d.visibility.classification === 'confidential' ? 'b-danger' : d.visibility.classification === 'public' ? 'b-ok' : 'b-warn'}>
                        {d.visibility.classification}
                      </Badge>
                    </td>
                    <td className="mono">{(d.visibility.departments || []).join(', ') || '—'}</td>
                    <td className="mono">{d.indexed ? `${d.chunkCount} 片` : '未索引'}</td>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        <button className="ghost small" type="button" onClick={() => startEdit(d.name, d.visibility)}>权限</button>
                        <button className="danger small" type="button" onClick={() => onDelete(d.name)}>删除</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editName ? (
          <div className="kb-perm-editor">
            <div className="section-title">
              <h3>编辑权限</h3>
              <span className="section-meta mono">{editName}</span>
            </div>
            <div className="kb-perm-grid">
              <label>
                分级
                <select value={editVis.classification} onChange={(e) => setEditVis({ ...editVis, classification: e.target.value as KbClassification })}>
                  <option value="public">public</option>
                  <option value="internal">internal</option>
                  <option value="confidential">confidential</option>
                </select>
              </label>
              <label>
                部门（逗号分隔，* 表示全员）
                <input value={editVis.departments.join(', ')} onChange={(e) => setEditVis({ ...editVis, departments: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
              </label>
              <label>
                角色（逗号分隔，机密文档必填）
                <input value={editVis.roles.join(', ')} onChange={(e) => setEditVis({ ...editVis, roles: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
              </label>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="ok" onClick={() => { void act.saveKbVisibility(editName, editVis).then(() => setEditName(null)); }}>保存权限</button>
              <button className="ghost" type="button" onClick={() => setEditName(null)}>取消</button>
            </div>
          </div>
        ) : null}
      </AdminSection>

      <div className="kb-secondary">
        <AdminSection title="试搜" meta={state.kbSearchMode || undefined}>
          <div className="kb-search-form">
            <input placeholder="检索问题" value={state.kbSearchQuery} onChange={(e) => act.update({ kbSearchQuery: e.target.value })} />
            <input placeholder="模拟部门" value={state.kbSearchDept} onChange={(e) => act.update({ kbSearchDept: e.target.value })} />
            <input placeholder="模拟角色" value={state.kbSearchRole} onChange={(e) => act.update({ kbSearchRole: e.target.value })} />
            <button onClick={() => void act.runKbSearch()}>搜索</button>
          </div>
          {state.kbSearchHits.length === 0 ? (
            <Empty>输入问题试搜，核对权限与召回。</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>来源</th><th>章节</th><th>分数</th><th>摘要</th></tr></thead>
                <tbody>
                  {state.kbSearchHits.map((h, i) => (
                    <tr key={i}>
                      <td className="mono">{h.source}</td>
                      <td>{h.heading}</td>
                      <td className="mono">{h.rerankScore?.toFixed(3) ?? h.score.toFixed(3)}</td>
                      <td>{h.snippet.slice(0, 120)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminSection>

        <AdminSection title="变更审计" meta={state.kbAudit.length ? `${state.kbAudit.length} 条` : undefined}>
          {state.kbAudit.length === 0 ? (
            <Empty>暂无 KB 审计记录</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>时间</th><th>用户</th><th>事件</th><th>详情</th></tr></thead>
                <tbody>
                  {state.kbAudit.map((ev, i) => (
                    <tr key={i}>
                      <td className="mono">{fmtTs(ev.ts)}</td>
                      <td className="mono">{ev.userId ?? '—'}</td>
                      <td className="mono">{ev.eventType}</td>
                      <td className="mono">{JSON.stringify(ev.payload ?? {})}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminSection>
      </div>
    </div>
  );
}

function ModelsSection({ state }: { state: AppState }) {
  const r = state.models;
  return (
    <section className="section admin-panel">
      <h2 className="plain-head">模型配置（只读）</h2>
      {!r ? (
        state.errors.models ? <LoadError msg={state.errors.models} /> : <Empty>加载中…</Empty>
      ) : (
        <div>
          <div className="row" style={{ marginBottom: 10 }}>
            <Badge tone="b-cloud">{'默认 ' + r.defaultModel}</Badge>
            <Badge tone={r.gateway.deployed ? 'b-ok' : 'b-off'}>{'网关 ' + (r.gateway.deployed ? '已部署' : '未部署')}</Badge>
            <Badge tone="b-cloud">{'云端 ' + (r.gateway.cloudBaseUrl || '—')}</Badge>
            <Badge tone="b-private">{'私有 ' + (r.gateway.privateBaseUrl || '—') + ' ' + (r.gateway.privateModel || '')}</Badge>
          </div>
          <table>
            <thead><tr><th>助手</th><th>模型</th><th>提供方</th><th>路由</th></tr></thead>
            <tbody>
              {r.agents.map((a, i) => (
                <tr key={i}>
                  <td>{a.name}</td>
                  <td className="mono">{a.model}</td>
                  <td className="mono">{a.provider}</td>
                  <td><Badge tone={a.route === 'private' ? 'b-private' : 'b-cloud'}>{a.route}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AuditSection({ state, act }: Props) {
  return (
    <section className="section admin-panel">
      <h2 className="plain-head">审计</h2>
      <div className="row" style={{ marginBottom: 8 }}>
        <input placeholder="userId" value={state.auditUser} onChange={(e) => act.update({ auditUser: e.target.value })} />
        <input placeholder="sessionId" value={state.auditSession} onChange={(e) => act.update({ auditSession: e.target.value })} />
        <input placeholder="eventType（如 admin.user.disable）" value={state.auditType} onChange={(e) => act.update({ auditType: e.target.value })} />
        <button onClick={() => void act.loadAudit()}>查询</button>
      </div>
      {state.audit.length === 0 ? (
        <Empty>无事件</Empty>
      ) : (
        <table>
          <thead><tr><th>时间</th><th>用户</th><th>会话</th><th>类型</th><th>payload</th></tr></thead>
          <tbody>
            {state.audit.map((e, i) => (
              <tr key={i}>
                <td className="mono">{fmtTs(e.ts)}</td>
                <td className="mono">{e.userId || ''}</td>
                <td className="mono">{shortId(e.sessionId || '')}</td>
                <td className="mono">{e.eventType}</td>
                <td className="mono">{JSON.stringify(e.payload ?? {})}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
