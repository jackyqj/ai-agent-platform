import { type Actions } from './useApp';
import { Badge, Empty } from './ui';
import { fmtTs } from './util';
import type { AppState, ComposeState } from './types';

// 三栏编排编辑器（agent-orchestration-design.md §9）：
// 左栏能力目录（只读）、中栏编排表单、右栏 YAML 只读预览 + 校验错误。
export default function AgentComposeView({ state, act }: { state: AppState; act: Actions }) {
  const c = state.compose;
  if (!c || !c.spec) return <Empty>加载中…</Empty>;
  const spec = c.spec;
  const cat = c.catalog;

  return (
    <div>
      <div className="page-head">
        <h1>Agent 编排</h1>
        <div className="sub">
          <Badge tone="b-cloud">{spec.id}</Badge>
          <Badge tone={c.dirty ? 'b-warn' : 'b-ok'}>{'v' + c.version + (c.dirty ? ' · 未发布' : '')}</Badge>
          {c.updatedBy ? <span className="hint">{'最后编辑 ' + c.updatedBy}</span> : null}
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12, gap: 8 }}>
        <button className="ghost" onClick={() => act.closeCompose()}>← 返回</button>
        <button className="ghost" onClick={() => void act.refreshComposePreview()}>预览</button>
        <button onClick={() => void act.saveComposeSpec()} disabled={c.saving}>{c.saving ? '…' : '保存草稿'}</button>
        <button className="ok" onClick={() => void act.publishCompose()} disabled={c.publishing || c.issues.length > 0}>
          {c.publishing ? '…' : '发布'}
        </button>
        {c.issues.length > 0 ? <span className="hint" style={{ color: 'var(--danger)' }}>{'校验未通过 ' + c.issues.length + ' 项'}</span> : null}
      </div>

      <div className="compose-grid">
        <aside className="card">
          <h2 className="plain-head">能力目录</h2>
          <CapabilityCatalogPane cat={cat} />
        </aside>

        <section className="card">
          <h2 className="plain-head">编排表单</h2>
          <SpecForm spec={spec} act={act} cat={cat} />
        </section>

        <aside className="card">
          <h2 className="plain-head">YAML 预览（只读）</h2>
          {c.issues.length > 0 ? (
            <div className="msg" style={{ color: 'var(--danger)' }}>
              {c.issues.map((i) => <div key={i.path}>{i.path}: {i.message}</div>)}
            </div>
          ) : null}
          <pre className="payload">{c.previewYaml}</pre>
        </aside>
      </div>

      <RevisionsSection c={c} act={act} />
    </div>
  );
}

function CapabilityCatalogPane({ cat }: { cat: ComposeState['catalog'] }) {
  if (!cat) return <Empty>无目录</Empty>;
  return (
    <div>
      <div className="msg" style={{ marginBottom: 8 }}>可勾选的模型与 MCP；host-plane 只读。</div>
      <h3 className="mini-head">模型</h3>
      {cat.models.map((m) => (
        <div key={m.provider + m.model} className="mono" style={{ fontSize: 12, padding: '2px 0' }}>
          {m.model} <span className="hint">({m.label})</span>
        </div>
      ))}
      <h3 className="mini-head">MCP</h3>
      {cat.mcpServers.map((m) => (
        <div key={m.serverName} className="mono" style={{ fontSize: 12, padding: '2px 0' }}>
          {m.serverName} <span className="hint">{m.label}</span>
        </div>
      ))}
      <h3 className="mini-head">host-plane（不可编排）</h3>
      {cat.hostPlane.map((h) => (
        <div key={h.id} className="mono" style={{ fontSize: 12, color: 'var(--text-faint)', padding: '2px 0' }}>{h.label}</div>
      ))}
    </div>
  );
}

const ROLES = ['employee', 'developer', 'admin'];
const APPROVAL = ['none', 'self', 'manager'] as const;

function SpecForm({ spec, act, cat }: { spec: NonNullable<ComposeState['spec']>; act: Actions; cat: ComposeState['catalog'] }) {
  const toggleMcp = (serverName: string) => {
    const has = spec.mcp.includes(serverName);
    act.editComposeSpec({ mcp: has ? spec.mcp.filter((m) => m !== serverName) : [...spec.mcp, serverName] });
  };
  const toggleRole = (role: string) => {
    const cur = spec.visibility.roles ?? [];
    const next = cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role];
    act.editComposeSpec({ visibility: { ...spec.visibility, roles: next.length ? next : undefined } });
  };

  return (
    <div className="form">
      <label>名称</label>
      <input value={spec.name} onChange={(e) => act.editComposeSpec({ name: e.target.value })} />

      <label>描述</label>
      <input value={spec.description} onChange={(e) => act.editComposeSpec({ description: e.target.value })} />

      <label>persona（system prompt 主体）</label>
      <textarea rows={8} value={spec.persona} onChange={(e) => act.editComposeSpec({ persona: e.target.value })} />

      <label>模型路由</label>
      <select
        value={spec.modelRoute.provider + '/' + spec.modelRoute.model}
        onChange={(e) => {
          const [provider, model] = e.target.value.split('/');
          act.editComposeSpec({ modelRoute: { provider, model, pinned: spec.modelRoute.pinned } });
        }}
      >
        {(cat?.models ?? []).map((m) => (
          <option key={m.provider + m.model} value={m.provider + '/' + m.model}>{m.label}</option>
        ))}
      </select>
      <label className="row" style={{ gap: 6 }}>
        <input type="checkbox" checked={spec.modelRoute.pinned} onChange={(e) => act.editComposeSpec({ modelRoute: { ...spec.modelRoute, pinned: e.target.checked } })} />
        钉死私有路由（pinned，控制面 + 网关强制）
      </label>

      <label>MCP 挂载（可见性白名单）</label>
      <div>
        {(cat?.mcpServers ?? []).map((m) => (
          <label key={m.serverName} className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={spec.mcp.includes(m.serverName)} onChange={() => toggleMcp(m.serverName)} />
            <span className="mono">{m.serverName}</span> <span className="hint">{m.label}</span>
          </label>
        ))}
      </div>

      <label>审批级别</label>
      <select value={spec.approvalLevel} onChange={(e) => act.editComposeSpec({ approvalLevel: e.target.value as typeof APPROVAL[number] })}>
        {APPROVAL.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>

      <label>可见角色（空 = 全员可见）</label>
      <div className="row" style={{ gap: 10 }}>
        {ROLES.map((r) => (
          <label key={r} className="row" style={{ gap: 4 }}>
            <input type="checkbox" checked={(spec.visibility.roles ?? []).includes(r)} onChange={() => toggleRole(r)} />
            {r}
          </label>
        ))}
      </div>
    </div>
  );
}

function RevisionsSection({ c, act }: { c: ComposeState; act: Actions }) {
  return (
    <section className="section">
      <h2 className="plain-head">修订历史</h2>
      {c.revisions.length === 0 ? (
        <Empty>尚无发布</Empty>
      ) : (
        <table>
          <thead><tr><th>版本</th><th>发布人</th><th>时间</th><th>描述</th><th></th></tr></thead>
          <tbody>
            {c.revisions.map((r) => (
              <tr key={r.version}>
                <td className="mono">v{r.version}</td>
                <td className="mono">{r.publishedBy}</td>
                <td className="mono">{fmtTs(r.publishedAt)}</td>
                <td>{r.spec.name} · {r.spec.modelRoute.model}</td>
                <td>
                  {r.version !== c.version ? (
                    <button className="ghost small" onClick={() => void act.rollbackCompose(r.version)}>回滚到此版本</button>
                  ) : <Badge tone="b-ok">当前</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
