import { useState } from 'react';
import { type Actions } from './useApp';
import { Badge, ConfirmBar, Empty, LiveDot, LoadError, permBadge } from './ui';
import { fmtTs, shortId } from './util';
import type { AdminPane, AppState } from './types';

const TABS: { id: AdminPane; label: string; hash: string }[] = [
  { id: 'workbench', label: '工作台', hash: '#admin' },
  { id: 'config', label: '配置', hash: '#admin/config' },
  { id: 'investigate', label: '调查', hash: '#admin/investigate' },
];

const ROLES = ['employee', 'developer', 'admin'];
const PERMS = ['read-only', 'workspace-write', 'danger-full-access'];

interface Props {
  state: AppState;
  act: Actions;
}

type Pending =
  | { kind: 'disable'; id: string; name: string }
  | { kind: 'unpublish'; id: string; name: string }
  | { kind: 'stop'; id: string }
  | { kind: 'reap' };

export default function AdminView({ state, act }: Props) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pane = state.adminPane;

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

  return (
    <div>
      <div className="page-head">
        <h1>管理后台</h1>
        <div className="sub">工作台处理待办，配置管目录与配额，调查查会话与审计</div>
      </div>
      <div className="indexbar" role="tablist">
        {TABS.map((t) => (
          <a
            key={t.id}
            role="tab"
            aria-selected={pane === t.id}
            href={t.hash}
            className={pane === t.id ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); setPane(t.id, t.hash); }}
          >
            {t.label}
          </a>
        ))}
      </div>

      {pending ? (
        <ConfirmBar
          body={confirmBody(pending)}
          confirmLabel={confirmLabel(pending)}
          onConfirm={runPending}
          onCancel={() => setPending(null)}
        />
      ) : null}

      {pane === 'workbench' ? (
        <>
          <ApprovalsSection state={state} act={act} />
          <StatsSection state={state} />
          <InstancesSection state={state} act={act} onStop={(id) => setPending({ kind: 'stop', id })} onReap={() => setPending({ kind: 'reap' })} />
        </>
      ) : null}
      {pane === 'config' ? (
        <>
          <AgentsSection state={state} act={act} onUnpublish={(id, name) => setPending({ kind: 'unpublish', id, name })} />
          <QuotaSection state={state} act={act} />
          <RbacSection state={state} act={act} />
          <ModelsSection state={state} />
        </>
      ) : null}
      {pane === 'investigate' ? (
        <>
          <UsersSection state={state} act={act} onDisable={(id, name) => setPending({ kind: 'disable', id, name })} />
          <SessionsInvestigate state={state} act={act} />
          <AuditSection state={state} act={act} />
        </>
      ) : null}
    </div>
  );
}

function confirmBody(p: Pending): string {
  switch (p.kind) {
    case 'disable':
      return `禁用 ${p.name} 会立即回收该用户的实例。`;
    case 'unpublish':
      return `下架「${p.name}」后，新会话将无法选用。存量会话不受影响。`;
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
    <section className="section">
      <h2 className="plain-head">待审批</h2>
      {pend.length === 0 ? (
        <Empty>无待审批</Empty>
      ) : (
        <table>
          <thead><tr><th>请求人</th><th>操作</th><th>级别</th><th>动作</th></tr></thead>
          <tbody>
            {pend.map((a) => (
              <tr key={a.id}>
                <td className="mono">{shortId(a.requesterUserId)}</td>
                <td>{a.action}</td>
                <td className="mono">{a.level}</td>
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
      )}
    </section>
  );
}

function AgentsSection({ state, act, onUnpublish }: Props & { onUnpublish: (id: string, name: string) => void }) {
  return (
    <section className="section">
      <h2 className="plain-head">助手上架 / 下架</h2>
      {state.allAgents.length === 0 ? (
        <Empty />
      ) : (
        <div>
          {state.allAgents.map((a) => (
            <div key={a.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span>
                {a.name}
                <span className="mono" style={{ color: 'var(--text-faint)' }}>{'  ' + a.id}</span>{' '}
                <Badge tone="b-cloud">{a.status}</Badge>
              </span>
              {a.status === 'published' ? (
                <button className="danger small" onClick={() => onUnpublish(a.id, a.name)}>下架</button>
              ) : (
                <button className="ok small" onClick={() => void act.toggleAgent(a.id, a.status ?? '')}>上架</button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StatsSection({ state }: { state: AppState }) {
  const s = state.stats?.stats;
  if (!s) {
    return (
      <section className="section">
        <h2 className="plain-head">用量</h2>
        {state.errors.stats ? <LoadError msg={state.errors.stats} /> : <Empty>加载中…</Empty>}
      </section>
    );
  }
  return (
    <section className="section">
      <h2 className="plain-head">用量</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <Badge tone="b-cloud">{'任务 ' + s.totals.tasks}</Badge>
        <Badge tone="b-off">{'失败 ' + s.totals.failed}</Badge>
        <Badge tone="b-dim">{'待审批 ' + s.totals.pendingApprovals}</Badge>
      </div>
      <table>
        <thead><tr><th>助手</th><th className="num">总数</th><th className="num">失败</th></tr></thead>
        <tbody>
          {(s.tasksByAgent || []).map((a, i) => (
            <tr key={i}><td>{a.agent}</td><td className="mono num">{a.total}</td><td className="mono num">{a.failed}</td></tr>
          ))}
        </tbody>
      </table>
      {s.recentErrors?.length ? (
        <div className="msg">{'最近失败：' + s.recentErrors.map((e) => e.id + ' ' + String(e.error || '').slice(0, 40)).join('；')}</div>
      ) : null}
    </section>
  );
}

function QuotaSection({ state, act }: Props) {
  return (
    <section className="section">
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
        <select value={state.qScope} onChange={(e) => act.update({ qScope: e.target.value as 'all' | 'user' })}>
          <option value="all">全员</option>
          <option value="user">用户</option>
        </select>
        <input placeholder="user 时填用户 id / keyId" value={state.qScopeId} style={{ flex: 1 }} onChange={(e) => act.update({ qScopeId: e.target.value })} />
        <input type="number" value={state.qBudget} min="1" style={{ width: 90 }} onChange={(e) => act.update({ qBudget: e.target.value })} />
        <button onClick={() => void act.setQuota()}>设置/更新</button>
      </div>
    </section>
  );
}

function UsersSection({ state, act, onDisable }: Props & { onDisable: (id: string, name: string) => void }) {
  const q = state.userFilter.toLowerCase();
  const rows = state.users.filter((u) =>
    !q || u.id.toLowerCase().includes(q) || u.name.toLowerCase().includes(q) || (u.dept || '').toLowerCase().includes(q));
  return (
    <section className="section">
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
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
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
    <section className="section">
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
    <section className="section">
      <h2 className="plain-head">实例</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="ghost" onClick={() => void act.loadAdminData()}>刷新</button>
        <button className="danger" onClick={onReap}>回收空闲</button>
      </div>
      {!r ? (
        state.errors.instances ? <LoadError msg={state.errors.instances} /> : <Empty>加载中…</Empty>
      ) : (
        <div>
          <div className="row" style={{ marginBottom: 10 }}>
            <LiveDot active={r.count > 0} />
            <span className="mono" style={{ color: 'var(--text-dim)' }}>{'live ' + r.count}</span>
            <Badge tone="b-dim">{'列表 ' + r.instances.length}</Badge>
          </div>
          {r.instances.length === 0 ? (
            <Empty>无实例</Empty>
          ) : (
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
          )}
        </div>
      )}
    </section>
  );
}

function RbacSection({ state, act }: Props) {
  const r = state.rbac;
  const overlays = r ? Object.entries(r.deptOverlays || {}) : [];
  return (
    <section className="section">
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

function ModelsSection({ state }: { state: AppState }) {
  const r = state.models;
  return (
    <section className="section">
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
    <section className="section">
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
