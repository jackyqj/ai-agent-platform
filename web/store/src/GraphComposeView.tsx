import { useState } from 'react';
import GraphCanvas from './GraphCanvas';
import { type Actions } from './useApp';
import { Badge, Empty } from './ui';
import { fmtTs } from './util';
import type { AppState, GraphComposeState, GraphNode, GraphSpec } from './types';

const ROLES = ['employee', 'developer', 'admin'];

export default function GraphComposeView({ state, act }: { state: AppState; act: Actions }) {
  const c = state.graphCompose;
  if (!c) return <Empty>加载中…</Empty>;

  return (
    <div>
      <div className="page-head">
        <h1>组合图编排</h1>
        <div className="sub">
          <Badge tone="b-cloud">{c.graphId}</Badge>
          <Badge tone={c.dirty ? 'b-warn' : 'b-ok'}>{'v' + c.version + (c.dirty ? ' · 未发布' : '')}</Badge>
          <Badge tone="b-cloud">{c.status}</Badge>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <button className="ghost" onClick={() => act.closeGraphCompose()}>← 返回</button>
        <button onClick={() => void act.saveGraphCompose()} disabled={c.saving}>{c.saving ? '…' : '保存草稿'}</button>
        <button className="ok" onClick={() => void act.publishGraphCompose()} disabled={c.publishing}>
          {c.publishing ? '…' : '发布上架'}
        </button>
        {c.status === 'published' ? (
          <button className="danger" onClick={() => void act.unpublishGraphProduct(c.graphId)}>下架</button>
        ) : null}
        <button className="ghost" onClick={() => act.editGraphComposeMeta({ showAdvancedJson: !c.showAdvancedJson })}>
          {c.showAdvancedJson ? '收起 JSON' : '高级 JSON'}
        </button>
        <span className="row" style={{ gap: 4, marginLeft: 'auto' }}>
          <button
            className={c.editorMode === 'list' ? '' : 'ghost'}
            onClick={() => act.editGraphComposeMeta({ editorMode: 'list' })}
          >
            列表
          </button>
          <button
            className={c.editorMode === 'canvas' ? '' : 'ghost'}
            onClick={() => act.editGraphComposeMeta({ editorMode: 'canvas' })}
          >
            画布
          </button>
        </span>
      </div>

      <div className={'compose-grid' + (c.editorMode === 'canvas' ? ' graph-workspace' : '')}>
        <aside className="card">
          <h2 className="plain-head">可引用能力</h2>
          <h3 className="mini-head">已发布 Agent</h3>
          {c.agents.filter((a) => a.status === 'published').map((a) => (
            <div key={a.id} className="mono" style={{ fontSize: 12, padding: '2px 0' }}>{a.id} · {a.name}</div>
          ))}
          <h3 className="mini-head">已发布工具</h3>
          {c.tools.filter((t) => t.status === 'published').length === 0 ? <Empty>暂无</Empty> : null}
          {c.tools.filter((t) => t.status === 'published').map((t) => (
            <div key={t.id} className="mono" style={{ fontSize: 12, padding: '2px 0' }}>{t.id} → {t.connectorId}</div>
          ))}
        </aside>

        <section className={'card' + (c.editorMode === 'canvas' ? ' graph-stage' : '')}>
          <h2 className="plain-head">{c.editorMode === 'canvas' ? '画布' : '步骤列表'}</h2>
          {c.editorMode === 'list' ? <MetaForm c={c} act={act} /> : <CanvasMetaStrip c={c} act={act} />}
          <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button className="ghost small" onClick={() => act.addGraphStep('agent')}>+ Agent</button>
            <button className="ghost small" onClick={() => act.addGraphStep('tool')}>+ Tool</button>
            <button className="ghost small" onClick={() => act.addGraphStep('gate')}>+ Gate</button>
          </div>
          {c.editorMode === 'canvas' ? (
            <>
              <p className="hint">拖节点排版，从右侧手柄拉线。选中后在右侧改属性。Delete 删除。</p>
              <GraphCanvas c={c} act={act} />
            </>
          ) : (
            <StepList c={c} act={act} />
          )}
          {c.showAdvancedJson ? <AdvancedJson c={c} act={act} /> : null}
        </section>

        <aside className="card graph-side">
          {c.editorMode === 'canvas' ? (
            <>
              <h2 className="plain-head">节点属性</h2>
              <SelectedInspector c={c} act={act} />
            </>
          ) : null}
          <h2 className="plain-head">试跑（工作副本）</h2>
          <textarea
            rows={3}
            placeholder="输入 task…"
            value={c.trialTask}
            onChange={(e) => act.editGraphComposeMeta({ trialTask: e.target.value })}
          />
          <button style={{ marginTop: 8 }} disabled={c.trialBusy} onClick={() => void act.trialGraphCompose()}>
            {c.trialBusy ? '运行中…' : '试跑'}
          </button>
          {c.trialRun ? <TrialResult run={c.trialRun} /> : null}
        </aside>
      </div>

      <RevisionsSection c={c} act={act} />
    </div>
  );
}

function CanvasMetaStrip({ c, act }: { c: GraphComposeState; act: Actions }) {
  return (
    <div className="row graph-meta-strip">
      <input value={c.name} onChange={(e) => act.editGraphComposeMeta({ name: e.target.value })} placeholder="名称" />
      <select
        value={c.spec.onError}
        onChange={(e) => act.editGraphComposeSpec({ onError: e.target.value as GraphSpec['onError'] })}
      >
        <option value="stop">遇错停止</option>
        <option value="continue">遇错继续</option>
      </select>
    </div>
  );
}

function MetaForm({ c, act }: { c: GraphComposeState; act: Actions }) {
  return (
    <div className="form" style={{ marginBottom: 12 }}>
      <label>名称</label>
      <input value={c.name} onChange={(e) => act.editGraphComposeMeta({ name: e.target.value })} />
      <label>描述</label>
      <input value={c.description} onChange={(e) => act.editGraphComposeMeta({ description: e.target.value })} />
      <label>失败策略</label>
      <select
        value={c.spec.onError}
        onChange={(e) => act.editGraphComposeSpec({ onError: e.target.value as GraphSpec['onError'] })}
      >
        <option value="stop">stop（遇错停止）</option>
        <option value="continue">continue（继续后续）</option>
      </select>
      <label>可见角色（空 = 全员）</label>
      <div className="row" style={{ gap: 10 }}>
        {ROLES.map((r) => {
          const on = (c.visibility.roles ?? []).includes(r);
          return (
            <label key={r} className="row" style={{ gap: 4 }}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => {
                  const cur = c.visibility.roles ?? [];
                  const roles = on ? cur.filter((x) => x !== r) : [...cur, r];
                  act.editGraphComposeMeta({ visibility: { ...c.visibility, roles: roles.length ? roles : undefined } });
                }}
              />
              {r}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function SelectedInspector({ c, act }: { c: GraphComposeState; act: Actions }) {
  const node = c.spec.nodes.find((n) => n.id === c.selectedNodeId);
  if (!node) return <Empty>点击画布上的节点编辑属性</Empty>;
  return <StepCard index={c.spec.nodes.indexOf(node)} node={node} c={c} act={act} showReorder={false} />;
}

function StepList({ c, act }: { c: GraphComposeState; act: Actions }) {
  const nodes = c.spec.nodes;
  return (
    <div>
      {nodes.length === 0 ? <Empty>还没有步骤，请添加</Empty> : null}
      {nodes.map((n, i) => (
        <StepCard key={n.id} index={i} node={n} c={c} act={act} showReorder />
      ))}
    </div>
  );
}

function StepCard({ index, node, c, act, showReorder }: { index: number; node: GraphNode; c: GraphComposeState; act: Actions; showReorder: boolean }) {
  const agents = c.agents.filter((a) => a.status === 'published');
  const tools = c.tools.filter((t) => t.status === 'published');
  return (
    <div className="card" style={{ marginBottom: 8, padding: 10, marginTop: showReorder ? 0 : 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="mono">{index + 1}. {node.id} · {node.kind}</span>
        <span className="row" style={{ gap: 4 }}>
          {showReorder ? (
            <>
              <button className="ghost small" disabled={index === 0} onClick={() => act.moveGraphStep(index, -1)}>↑</button>
              <button className="ghost small" disabled={index >= c.spec.nodes.length - 1} onClick={() => act.moveGraphStep(index, 1)}>↓</button>
            </>
          ) : null}
          <button className="danger small" onClick={() => act.removeGraphStep(node.id)}>删</button>
        </span>
      </div>
      {(() => {
        switch (node.kind) {
          case 'agent':
            return (
              <>
                <label>Agent</label>
                <select
                  value={node.agentPresetId ?? ''}
                  onChange={(e) => act.patchGraphStep(node.id, { agentPresetId: e.target.value })}
                >
                  <option value="">选择…</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
                </select>
                <label>promptTemplate</label>
                <textarea
                  rows={3}
                  value={node.promptTemplate ?? ''}
                  onChange={(e) => act.patchGraphStep(node.id, { promptTemplate: e.target.value })}
                  placeholder="{{input.task}} / {{nodes.prev.output}}"
                />
              </>
            );
          case 'tool':
            return (
              <>
                <label>工具</label>
                <select value={node.toolId ?? ''} onChange={(e) => act.patchGraphStep(node.id, { toolId: e.target.value })}>
                  <option value="">选择…</option>
                  {tools.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}
                </select>
                <label>参数（JSON 对象，值为模板字符串）</label>
                <ArgsEditor node={node} act={act} />
              </>
            );
          case 'gate':
            return (
              <>
                <label>when（插值后为 true/1/yes 才继续）</label>
                <input value={node.when ?? ''} onChange={(e) => act.patchGraphStep(node.id, { when: e.target.value })} />
              </>
            );
          default: {
            const _never: never = node.kind;
            return _never;
          }
        }
      })()}
    </div>
  );
}

function ArgsEditor({ node, act }: { node: GraphNode; act: Actions }) {
  const raw = JSON.stringify(node.argsTemplate ?? {}, null, 2);
  const [text, setText] = useState(raw);
  const [err, setErr] = useState('');
  return (
    <div>
      <textarea
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value) as Record<string, string>;
            setErr('');
            act.patchGraphStep(node.id, { argsTemplate: parsed });
          } catch {
            setErr('JSON 无效');
          }
        }}
      />
      {err ? <div className="hint" style={{ color: 'var(--danger)' }}>{err}</div> : null}
    </div>
  );
}

function AdvancedJson({ c, act }: { c: GraphComposeState; act: Actions }) {
  const [text, setText] = useState(JSON.stringify(c.spec, null, 2));
  const [err, setErr] = useState('');
  return (
    <div style={{ marginTop: 12 }}>
      <h3 className="mini-head">GraphSpec JSON</h3>
      <textarea
        rows={12}
        style={{ width: '100%', fontFamily: 'var(--mono, monospace)' }}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const spec = JSON.parse(e.target.value) as GraphSpec;
            setErr('');
            act.editGraphComposeSpec(spec);
          } catch {
            setErr('JSON 无效');
          }
        }}
      />
      {err ? <div className="hint" style={{ color: 'var(--danger)' }}>{err}</div> : null}
    </div>
  );
}

function TrialResult({ run }: { run: NonNullable<GraphComposeState['trialRun']> }) {
  const waiting = run.status === 'awaiting_approval' || run.status === 'running';
  return (
    <div className="msg" style={{ marginTop: 10 }}>
      <div>状态：{run.status}{run.error ? ` · ${run.error}` : ''}</div>
      {waiting ? <div className="hint">审批通过后会自动继续，无需刷新。</div> : null}
      {run.result ? <div>结果：{run.result.slice(0, 400)}</div> : null}
      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {(run.steps ?? []).map((s, i) => (
          <li key={s.nodeId + '-' + i} className="mono" style={{ fontSize: 12 }}>
            {s.nodeId}/{s.kind}: {s.status}
            {s.output ? ` → ${s.output.slice(0, 80)}` : ''}
            {s.error ? ` ! ${s.error}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RevisionsSection({ c, act }: { c: GraphComposeState; act: Actions }) {
  return (
    <section className="section" style={{ marginTop: 16 }}>
      <h2 className="plain-head">修订历史</h2>
      {c.revisions.length === 0 ? (
        <Empty>尚无发布</Empty>
      ) : (
        <table>
          <thead><tr><th>版本</th><th>发布人</th><th>时间</th><th>名称</th><th></th></tr></thead>
          <tbody>
            {c.revisions.map((r) => (
              <tr key={r.version}>
                <td className="mono">v{r.version}</td>
                <td className="mono">{r.publishedBy}</td>
                <td className="mono">{fmtTs(r.publishedAt)}</td>
                <td>{r.name} · {r.spec.nodes.length} 步</td>
                <td>
                  {r.version !== c.version ? (
                    <button className="ghost small" onClick={() => void act.rollbackGraphCompose(r.version)}>回滚到此版本</button>
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
