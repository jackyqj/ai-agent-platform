import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { extractArtifacts, extractCitations, mergeCitations } from './chat-extract';
import { buildChatTimeline, liveStripText } from './chat-timeline';
import { resolveSessionTitle } from './chat-utils';
import CopyTextButton from './CopyTextButton';
import MarkdownBody from './MarkdownBody';
import type { Actions } from './useApp';
import type { AppState, ChatItem, SessionRow, TaskInquiry } from './types';

export default function ChatView({ state, act }: { state: AppState; act: Actions }) {
  const chat = state.chat;
  const [draft, setDraft] = useState('');
  const messages = chat?.messages ?? [];
  const parsedCitations = useMemo(
    () => mergeCitations(chat?.citations ?? [], messages.filter((m) => m.role === 'assistant').flatMap((m) => extractCitations(m.text))),
    [chat?.citations, messages],
  );
  const artifacts = useMemo(
    () => messages.filter((m) => m.role === 'assistant').flatMap((m) => extractArtifacts(m.text)),
    [messages],
  );
  const pending = state.myApprovals.filter((a) => a.status === 'pending');
  const timeline = useMemo(
    () => buildChatTimeline({
      messages,
      sending: chat?.sending,
      awaitingApproval: chat?.awaitingApproval,
      pendingApprovals: pending,
      runPhase: chat?.runPhase,
      inquiry: chat?.inquiry,
    }),
    [messages, chat?.sending, chat?.awaitingApproval, pending, chat?.runPhase, chat?.inquiry],
  );
  const live = liveStripText({
    error: chat?.error,
    sending: chat?.sending,
    awaitingApproval: chat?.awaitingApproval,
    pendingCount: pending.length,
    runPhase: chat?.runPhase,
    inquiry: !!chat?.inquiry,
  });
  const streamRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    const slack = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (slack < 96) el.scrollTop = el.scrollHeight;
  }, [timeline.length, live, chat?.inquiry?.requestId]);

  if (!chat) return null;

  const agentId = chat.agentId;
  const agent = state.agents.find((a) => a.id === agentId);
  const name = agent?.name ?? agentId;
  const sending = chat.sending ?? false;
  const title = resolveSessionTitle(name, chat.sessionId, state.sessionTitles, messages);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    await act.sendMessage(agentId, text);
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="chat-workbench">
      <div className="chat">
        <header className="page-head chat-head">
          <div className="chat-head-actions">
            <button className="ghost small" onClick={() => act.closeChat()}>回市集</button>
            {chat.sessionId ? (
              <button
                className="danger small"
                aria-label="删除对话"
                onClick={() => void act.deleteSession(chat.sessionId!)}
              >
                删除对话
              </button>
            ) : null}
          </div>
          <h1>{title}</h1>
          <p className="sub">{agent?.description || '来自市集选用 · 向 Agent 提问'}</p>
        </header>

        {chat.error ? (
          <div className="banner warn">
            {chat.error}
            <button className="ghost small" onClick={() => void act.startChat(chat.agentId)}>重试</button>
          </div>
        ) : chat.historyLoading ? (
          <div className="banner ok">正在加载历史记录…</div>
        ) : null}

        <div className="transcript" ref={streamRef} aria-label="对话时间线">
          {!chat.historyLoading && timeline.length === 0 ? (
            <div className="empty">直接输入问题。需要审批的助手会先挂起任务。</div>
          ) : (
            timeline.map((item, i) => (
              <TimelineRow
                key={`${item.kind}-${i}`}
                item={item}
                agentName={name}
                inquiry={chat.inquiry}
                onCancelApproval={(id) => void act.cancelApproval(id)}
                onAnswerInquiry={(body) => void act.answerInquiry(body)}
              />
            ))
          )}
        </div>

        <div className="chat-live" role="status">{live}</div>

        <form
          className="composer"
          aria-label="发送消息"
          onSubmit={(e) => { e.preventDefault(); void send(); }}
        >
          <textarea
            value={draft}
            placeholder={chat.inquiry ? '先在上面的问询卡里选择方向…' : '跟森米说点什么…'}
            disabled={!!chat.error || !!chat.inquiry}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onComposerKey}
          />
          {sending ? (
            <button type="button" className="danger" onClick={() => void act.cancelRun()}>停止</button>
          ) : (
            <button type="submit" disabled={!!chat.error}>发送</button>
          )}
        </form>
      </div>

      <aside className="chat-rail" aria-label="对话侧栏">
        <section className="mini">
          <h5>当前 Agent</h5>
          <p>{name}</p>
        </section>
        {parsedCitations.length > 0 ? (
          <section className="mini">
            <h5>引用</h5>
            <ul className="rail-cite">
              {parsedCitations.slice(0, 8).map((h) => (
                <li key={h.source}>
                  <strong>{h.heading || h.source}</strong>
                  {h.snippet ? <span>{h.snippet.slice(0, 80)}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : agent?.knowledge ? (
          <section className="mini">
            <h5>引用</h5>
            <p>知识库出处会在回答后出现在这里。</p>
          </section>
        ) : null}
        {artifacts.length > 0 ? (
          <section className="mini">
            <h5>工件</h5>
            <ul className="rail-cite">
              {artifacts.map((art) => (
                <li key={art.title}>
                  <strong>{art.title}</strong>
                  <span className="row" style={{ gap: 6, marginTop: 4 }}>
                    <button className="ghost small" onClick={() => void navigator.clipboard.writeText(art.body)}>复制</button>
                    <button className="ghost small" onClick={() => downloadText(art.title, art.body)}>导出</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {state.mySessions.length > 0 ? (
          <section className="mini">
            <h5>最近对话</h5>
            <ul className="rail-sessions">
              {state.mySessions.slice(0, 8).map((s) => (
                <RailSession key={s.id} s={s} activeId={chat.sessionId ?? undefined} state={state} act={act} />
              ))}
            </ul>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function TimelineRow({
  item,
  agentName,
  inquiry,
  onCancelApproval,
  onAnswerInquiry,
}: {
  item: ChatItem;
  agentName: string;
  inquiry?: TaskInquiry;
  onCancelApproval: (id: string) => void;
  onAnswerInquiry: (body: { cancelled?: boolean; answers?: { id: string; selected: string[]; custom?: string }[] }) => void;
}) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="bubble user">
          <div className="bubble-toolbar">
            <div className="bubble-role">我</div>
          </div>
          <div className="bubble-text">{item.text}</div>
        </div>
      );
    case 'assistant':
      return (
        <div className="bubble assistant">
          <div className="bubble-toolbar">
            <div className="bubble-role">{agentName}</div>
            <CopyTextButton text={item.text} label="复制原文" />
          </div>
          <MarkdownBody text={item.text} />
        </div>
      );
    case 'status':
      return (
        <ol className="chat-status" aria-label="本回合步骤">
          <li className={'chat-step' + (item.phase === 'running' ? ' chat-step--live' : '')}>
            <span>{item.label}</span>
          </li>
        </ol>
      );
    case 'approval':
      return (
        <section className="chat-gate" aria-label="审批闸门">
          <div className="chat-gate-kicker">需要审批</div>
          <p>{item.action}</p>
          <p className="chat-gate-meta">{item.level}</p>
          {item.status === 'pending' ? (
            <button className="danger small" onClick={() => onCancelApproval(item.approvalId)}>撤销</button>
          ) : null}
        </section>
      );
    case 'inquiry':
      return inquiry ? (
        <InquiryCard inquiry={inquiry} onAnswer={onAnswerInquiry} />
      ) : (
        <section className="chat-gate" aria-label="问询">
          <div className="chat-gate-kicker">需要你拍板</div>
          <p>{item.prompt}</p>
        </section>
      );
    case 'notice':
      return <div className={'chat-notice chat-notice--' + item.tone}>{item.text}</div>;
    default: {
      const _never: never = item;
      return _never;
    }
  }
}

function InquiryCard({
  inquiry,
  onAnswer,
}: {
  inquiry: TaskInquiry;
  onAnswer: (body: { cancelled?: boolean; answers?: { id: string; selected: string[]; custom?: string }[] }) => void;
}) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [extra, setExtra] = useState('');
  useEffect(() => {
    setPicked({});
    setExtra('');
  }, [inquiry.requestId]);

  function toggle(questionId: string, optionId: string, multi: boolean) {
    setPicked((prev) => {
      const current = prev[questionId] ?? [];
      if (multi) {
        const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
        return { ...prev, [questionId]: next };
      }
      return { ...prev, [questionId]: [optionId] };
    });
  }

  const ready = inquiry.questions.every((question) => (
    question.options.length === 0 || (picked[question.id] ?? []).length > 0
  ));

  function submit() {
    if (!ready) return;
    onAnswer({
      answers: inquiry.questions.map((question, index) => ({
        id: question.id,
        selected: picked[question.id] ?? [],
        ...(index === 0 && extra.trim() ? { custom: extra.trim() } : {}),
      })),
    });
  }

  return (
    <section className="chat-gate" aria-label="问询">
      <div className="chat-gate-kicker">需要你拍板</div>
      {inquiry.questions.map((question) => {
        const selected = picked[question.id] ?? [];
        const title = question.header ? `${question.header} · ${question.prompt}` : question.prompt;
        return (
          <div key={question.id} className="chat-inquiry-q">
            <p>{title}</p>
            {question.detail ? <p className="chat-gate-meta">{question.detail}</p> : null}
            {question.options.length > 0 ? (
              <div className="chat-choices" role="group" aria-label={title}>
                {question.options.map((option) => {
                  const on = selected.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={'chat-choice' + (on ? ' is-on' : '')}
                      aria-pressed={on}
                      onClick={() => toggle(question.id, option.id, !!question.multiSelect)}
                    >
                      {option.label}
                      {option.hint ? <span>{option.hint}</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
      <textarea
        rows={2}
        value={extra}
        placeholder="补充一句（可选）"
        aria-label="补充说明"
        onChange={(e) => setExtra(e.target.value)}
      />
      <div className="row">
        <button type="button" onClick={submit} disabled={!ready}>提交</button>
        <button type="button" className="ghost" onClick={() => onAnswer({ cancelled: true })}>跳过</button>
      </div>
    </section>
  );
}

function downloadText(title: string, body: string) {
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = title.replace(/\s+/g, '-') + '.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function RailSession({
  s,
  activeId,
  state,
  act,
}: {
  s: SessionRow;
  activeId?: string;
  state: AppState;
  act: Actions;
}) {
  const label = state.sessionTitles[s.id] ?? state.agents.find((a) => a.id === s.agentPresetId)?.name ?? s.agentPresetId;
  const active = s.id === activeId;
  return (
    <li>
      <button
        type="button"
        className={'rail-session' + (active ? ' active' : '')}
        onClick={() => { if (!active) void act.openChat(s.id, s.agentPresetId); }}
      >
        {label}
      </button>
    </li>
  );
}
