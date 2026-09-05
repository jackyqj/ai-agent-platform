import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type Actions } from './useApp';
import { Badge, Empty } from './ui';
import { canSkillManage, canSkillReview } from './kb-utils';
import type { AppState, SkillItem, SkillVersionView } from './types';

function sentences(body: string): Array<{ text: string; line: number }> {
  const out: Array<{ text: string; line: number }> = [];
  body.split('\n').forEach((line, i) => {
    for (const part of line.split(/(?<=[。！？.!?])/)) {
      if (part.trim()) out.push({ text: part, line: i + 1 });
    }
  });
  return out;
}

function statusTone(status: string): 'b-ok' | 'b-warn' | 'b-cloud' | 'b-private' {
  switch (status) {
    case 'published': return 'b-ok';
    case 'pending': return 'b-warn';
    case 'archived': return 'b-private';
    default: return 'b-cloud';
  }
}

export default function SkillStoreView({ state, act }: { state: AppState; act: Actions }) {
  const me = state.me;
  const canReview = canSkillReview(me);
  const canManage = canSkillManage(me);
  const pending = state.skillVersions.filter((v) => v.status === 'pending');

  if (state.skillCreating) return <SkillEditor state={state} act={act} creating />;
  if (state.skillDetail) {
    return (
      <SkillDetail
        state={state}
        act={act}
        pending={pending}
        canReview={canReview}
        canManage={canManage}
      />
    );
  }

  return (
    <div className="store">
      <header className="store-hero">
        <p className="eyebrow">内部工具 · Skill 市场</p>
        <h1>技能</h1>
        <p className="lead">创建、审核、评分公司技能。已发布的 skill 会出现在列表中，也可由 dsh 插件拉取到本地。</p>
      </header>
      <div className="toolbar">
        <button onClick={() => act.update({ skillCreating: true, skillDetail: null })}>新建 skill</button>
      </div>
      {canReview ? <ReviewHint skills={state.skills} act={act} /> : null}
      <section className="section">
        {state.skills.length === 0 ? (
          <Empty>还没有可见的 skill。点「新建 skill」提交第一篇。</Empty>
        ) : (
          <div className="agents">
            {state.skills.map((s) => (
              <button key={s.id} className="agent-card" onClick={() => void act.openSkill(s.id)}>
                <div className="agent-card-head">
                  <strong>{s.title}</strong>
                  <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                </div>
                <p className="muted">{s.description || s.slug}</p>
                <div className="skill-meta">
                  <span>★ {s.stars.toFixed(1)}</span>
                  <span>{s.likeCount} 赞 · {s.dislikeCount} 踩</span>
                  {(s.tags ?? []).length ? <span>{s.tags?.join(' · ')}</span> : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewHint({ skills, act }: { skills: SkillItem[]; act: Actions }) {
  const pending = skills.filter((s) => s.status === 'pending');
  if (!pending.length) return null;
  return (
    <section className="section">
      <h2>待审核 {pending.length}</h2>
      <ul className="plain">
        {pending.map((s) => (
          <li key={s.id}>
            <button className="linkish" onClick={() => void act.openSkill(s.id)}>{s.title}</button>
            <span className="muted"> · {s.slug}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SkillEditor({ state, act, creating }: { state: AppState; act: Actions; creating?: boolean }) {
  const f = state.skillForm;
  const set = (patch: Partial<AppState['skillForm']>) => act.update({ skillForm: { ...f, ...patch } });
  return (
    <div className="store">
      <header className="store-hero">
        <p className="eyebrow">Skill</p>
        <h1>{creating ? '新建 skill' : '编辑 ' + (state.skillDetail?.title ?? '')}</h1>
      </header>
      <div className="skill-editor">
        <label>slug<input value={f.slug} disabled={!creating} onChange={(e) => set({ slug: e.target.value })} /></label>
        <label>标题<input value={f.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label>简介<input value={f.description} onChange={(e) => set({ description: e.target.value })} /></label>
        <label>版本<input value={f.version} onChange={(e) => set({ version: e.target.value })} /></label>
        <label>可见性
          <select value={f.visibility} onChange={(e) => set({ visibility: e.target.value })}>
            <option value="company">全公司</option>
            <option value="department">仅本部门</option>
          </select>
        </label>
        <label>tags<input value={f.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="逗号分隔" /></label>
        <label className="wide">正文
          <textarea rows={12} value={f.body} onChange={(e) => set({ body: e.target.value })} />
        </label>
        <div className="preview">
          <h3>预览</h3>
          <Markdown remarkPlugins={[remarkGfm]}>{f.body || '_无正文_'}</Markdown>
        </div>
      </div>
      <div className="toolbar">
        {creating ? (
          <button onClick={() => void act.createSkill()}>创建草稿</button>
        ) : (
          <>
            <button onClick={() => void act.saveSkill()}>保存</button>
            <button onClick={() => void act.submitSkill()}>提交审核</button>
            {state.skillDetail?.status === 'published' ? <button className="ghost" onClick={() => void act.addSkillVersion()}>提交新版本</button> : null}
          </>
        )}
        <button className="ghost" onClick={() => creating ? act.update({ skillCreating: false }) : act.closeSkill()}>返回</button>
      </div>
    </div>
  );
}

function SkillDetail({
  state, act, pending, canReview, canManage,
}: {
  state: AppState;
  act: Actions;
  pending: SkillVersionView[];
  canReview: boolean;
  canManage: boolean;
}) {
  const s = state.skillDetail!;
  const published = state.skillVersions.find((v) => v.status === 'published' && v.id === s.currentVersionId)
    ?? state.skillVersions.find((v) => v.status === 'published');
  const body = published?.body ?? s.draftBody ?? '';
  const isOwner = s.ownerId === state.me?.id;
  const reading = s.status === 'published' && !state.skillCreating;

  return (
    <div className="store">
      <header className="store-hero">
        <p className="eyebrow">{s.slug}</p>
        <h1>{s.title}</h1>
        <p className="lead">{s.description}</p>
        <div className="skill-meta">
          <Badge tone={statusTone(s.status)}>{s.status}</Badge>
          <span>★ {s.stars.toFixed(1)}</span>
          <span>{s.likeCount} 赞 · {s.dislikeCount} 踩</span>
        </div>
      </header>
      <div className="toolbar">
        <button className="ghost" onClick={() => act.closeSkill()}>返回列表</button>
        {isOwner || canManage ? <button onClick={() => act.update({ skillCreating: false, skillForm: { ...state.skillForm, body: s.draftBody ?? body } })}>编辑</button> : null}
        {s.status === 'published' ? (
          <>
            <button className={s.myFeedback === 'like' ? '' : 'ghost'} onClick={() => void act.voteSkill('like')}>赞</button>
            <button className={s.myFeedback === 'dislike' ? '' : 'ghost'} onClick={() => void act.voteSkill('dislike')}>踩</button>
          </>
        ) : null}
        {canManage && s.status !== 'archived' ? <button className="ghost" onClick={() => void act.archiveSkill()}>下架</button> : null}
      </div>

      {isOwner || canManage ? <SkillEditor state={state} act={act} /> : null}

      {canReview && pending.length > 0 ? (
        <section className="section">
          <h2>待审核版本</h2>
          {pending.map((v) => (
            <div key={v.id} className="card">
              <p>v{v.version}</p>
              <pre className="skill-body">{v.body}</pre>
              <div className="toolbar">
                <button onClick={() => void act.reviewSkill(v.id, 'approve')}>通过</button>
                <button className="ghost" onClick={() => void act.reviewSkill(v.id, 'reject', '请补充说明')}>驳回</button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {reading && body ? (
        <section className="section">
          <h2>阅读 · 点击句子提建议</h2>
          <div className="skill-read">
            {sentences(body).map((part, i) => (
              <button key={i} className="sentence" type="button" onClick={() => act.startChangeRequest(part.line, part.text)}>
                {part.text}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {state.crDraft ? (
        <section className="section card">
          <h2>改稿建议</h2>
          <p className="muted">第 {state.crDraft.lineNo} 行 · {state.crDraft.originalText}</p>
          <textarea
            rows={3}
            value={state.crDraft.suggested}
            onChange={(e) => act.update({ crDraft: { ...state.crDraft!, suggested: e.target.value } })}
          />
          <input
            placeholder="理由"
            value={state.crDraft.reason}
            onChange={(e) => act.update({ crDraft: { ...state.crDraft!, reason: e.target.value } })}
          />
          <div className="toolbar">
            <button onClick={() => void act.submitChangeRequest()}>提交</button>
            <button className="ghost" onClick={() => act.update({ crDraft: null })}>取消</button>
          </div>
        </section>
      ) : null}

      {state.skillRequests.length > 0 ? (
        <section className="section">
          <h2>改稿工单</h2>
          <ul className="plain">
            {state.skillRequests.map((c) => (
              <li key={c.id} className="card">
                <div><Badge tone={statusTone(c.status)}>{c.status}</Badge> {c.suggestedText}</div>
                {c.reason ? <p className="muted">{c.reason}</p> : null}
                {c.resolvedVersion ? <p className="muted">随 v{c.resolvedVersion} 已处理</p> : null}
                {c.status === 'open' && (isOwner || canReview) ? (
                  <div className="toolbar">
                    <button onClick={() => void act.handleChangeRequest(c.id, 'adopted')}>采纳</button>
                    <button className="ghost" onClick={() => void act.handleChangeRequest(c.id, 'rejected', '暂不采纳')}>拒绝</button>
                    <button className="ghost" onClick={() => void act.handleChangeRequest(c.id, 'replied', '已阅')}>回复</button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
