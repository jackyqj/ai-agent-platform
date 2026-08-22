import type { ReactNode } from 'react';

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={'badge ' + tone}>{children}</span>;
}

export function SectionHead({ idx, title, hint }: { idx: string; title: string; hint?: string }) {
  return (
    <div className="section-head">
      <span className="idx">{idx}</span>
      <h2>{title}</h2>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function LiveDot({ active }: { active: boolean }) {
  return <span className={active ? 'dot-live' : 'dot-idle'} />;
}

export function Empty({ children = '无' }: { children?: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function LoadError({ msg }: { msg?: string }) {
  return msg ? <div className="msg" style={{ color: 'var(--danger)' }}>加载失败：{msg}</div> : null;
}

export function permBadge(mode?: string): string {
  return mode === 'danger-full-access' ? 'b-off' : mode === 'read-only' ? 'b-cloud' : 'b-ok';
}

export function ConfirmBar({
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="confirm" role="alertdialog">
      <p>{body}</p>
      <div className="row">
        <button className="danger" onClick={onConfirm}>{confirmLabel}</button>
        <button className="ghost" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
