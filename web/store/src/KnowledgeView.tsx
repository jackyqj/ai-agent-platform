import { useEffect, useRef } from 'react';
import type { Actions } from './useApp';
import { Empty } from './ui';
import type { AppState } from './types';

export default function KnowledgeView({ state, act }: { state: AppState; act: Actions }) {
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void act.loadEmployeeKb();
  }, [act]);

  return (
    <div className="page-stack">
      <header className="page-head">
        <p className="eyebrow">知识库</p>
        <h1>只读检索</h1>
        <p className="sub">按你的部门可见范围查找制度与文档。上传和索引在管理里。</p>
      </header>

      <form
        className="store-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void act.searchEmployeeKb();
        }}
      >
        <input
          className="store-search"
          placeholder="搜知识库…"
          value={state.employeeKbQuery}
          onChange={(e) => act.update({ employeeKbQuery: e.target.value })}
        />
        <button type="submit">检索</button>
      </form>

      {state.employeeKbHits.length > 0 ? (
        <section className="section">
          <div className="section-title">
            <h2>检索结果</h2>
            <span className="section-meta">{state.employeeKbMode || 'hits'}</span>
          </div>
          <ul className="queue-list">
            {state.employeeKbHits.map((h, i) => (
              <li key={`${h.source}-${i}`} className="queue-item">
                <div className="queue-body">
                  <span className="queue-label">{h.heading || h.source}</span>
                  <span className="queue-meta">{h.source}{h.snippet ? ` · ${h.snippet.slice(0, 120)}` : ''}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="section">
        <div className="section-title">
          <h2>可见文档</h2>
          <span className="section-meta">{state.employeeKbDocs.length} 份</span>
        </div>
        {state.employeeKbDocs.length === 0 ? (
          <Empty>当前可见范围内没有文档。</Empty>
        ) : (
          <ul className="queue-list">
            {state.employeeKbDocs.map((d) => (
              <li key={d.name} className="queue-item">
                <div className="queue-body">
                  <span className="queue-label">{d.name}</span>
                  <span className="queue-meta">{d.visibility.classification} · {d.indexed ? `${d.chunkCount} 切片` : '未索引'}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
