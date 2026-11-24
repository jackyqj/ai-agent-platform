import { useEffect, useState } from 'react';
import { API_HOST_DISPLAY, parseLocation, useApp, type Actions } from './useApp';
import { applyTheme, readTheme, writeTheme, type Theme } from './theme';
import { canKbManage, isFullAdmin } from './kb-utils';
import LoginIllustration from './LoginIllustration';
import StoreView from './StoreView';
import SkillStoreView from './SkillStoreView';
import AdminView from './AdminView';
import ChatView from './ChatView';
import type { Client } from './store-client';
import type { AdminPane, AppState } from './types';

export default function App({ client }: { client?: Client }) {
  const { state, act } = useApp(client);
  const fullAdmin = isFullAdmin(state.me);
  const kbMgr = canKbManage(state.me);
  const kbOnly = kbMgr && !fullAdmin;
  const route = !state.me
    ? 'store'
    : state.route === 'admin' && !kbMgr
      ? 'store'
      : state.route;

  useEffect(() => {
    document.documentElement.classList.add('shell-ready');
    return () => document.documentElement.classList.remove('shell-ready');
  }, []);

  useEffect(() => {
    const onHash = () => {
      if (!state.me) return;
      const parsed = parseLocation(location.hash, state.me);
      if (parsed.route === 'skills' && parsed.skillId) {
        if (state.skillDetail?.id !== parsed.skillId) void act.openSkill(parsed.skillId);
      } else if (parsed.route === 'skills' && !parsed.skillId && state.skillDetail) {
        act.closeSkill();
      }
      if (parsed.route !== state.route || parsed.adminPane !== state.adminPane) {
        act.update({
          route: parsed.route === 'chat' && !state.chat ? 'store' : parsed.route,
          adminPane: parsed.adminPane,
        });
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [state.me, state.route, state.adminPane, state.chat, state.skillDetail, act]);

  return (
    <div className={'shell' + (state.me ? ' shell--app' : ' shell--login') + (route === 'chat' ? ' shell--chat' : '')}>
      {state.me ? (
        <AppSidebar kbMgr={kbMgr} fullAdmin={fullAdmin} kbOnly={kbOnly} route={route} state={state} act={act} />
      ) : (
        <LoginBrand />
      )}
      <main className={'main' + (!state.me ? ' main--login' : '') + (route === 'admin' ? ' main--wide' : '') + (route === 'chat' ? ' main--chat' : '')}>
        {!state.me ? (
          <LoginView state={state} act={act} />
        ) : route === 'chat' && state.chat ? (
          <ChatView state={state} act={act} />
        ) : route === 'admin' && kbMgr ? (
          <AdminView state={state} act={act} kbOnly={kbOnly} />
        ) : route === 'skills' ? (
          <SkillStoreView state={state} act={act} />
        ) : (
          <StoreView state={state} act={act} />
        )}
      </main>
      {state.toast ? <div className={'toast' + (state.toastErr ? ' err' : '')}>{state.toast}</div> : null}
    </div>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    writeTheme(next);
    applyTheme(next);
  };
  return (
    <button className="ghost theme-toggle" onClick={toggle} title="切换亮/暗主题">
      {theme === 'dark' ? '☀ 亮色' : '🌙 暗色'}
    </button>
  );
}

function BrandMark() {
  return (
    <div className="brand-lockup">
      <span className="logo-mark" aria-hidden="true">彼</span>
      <span className="logo-text">
        小彼恩 DSH
        <span>森米工作台</span>
      </span>
    </div>
  );
}

function LoginBrand() {
  return (
    <header className="login-brand">
      <BrandMark />
      <ThemeToggle />
    </header>
  );
}

function AppSidebar({
  kbMgr,
  fullAdmin,
  kbOnly,
  route,
  state,
  act,
}: {
  kbMgr: boolean;
  fullAdmin: boolean;
  kbOnly: boolean;
  route: string;
  state: AppState;
  act: Actions;
}) {
  const pending = state.myApprovals.filter((a) => a.status === 'pending').length;
  const go = (key: 'store' | 'admin' | 'skills', label: string, hash = '#' + key, icon: string) => (
    <a
      className={'nav-item' + (route === key ? ' active' : '')}
      href={hash}
      onClick={(e) => {
        e.preventDefault();
        const adminPane: AdminPane = key === 'admin' ? (kbOnly ? 'kb' : 'workbench') : state.adminPane;
        act.update({
          route: key,
          adminPane,
          chat: key === 'store' || key === 'skills' ? null : state.chat,
          skillCreating: false,
          skillDetail: key === 'store' || key === 'skills' ? null : state.skillDetail,
        });
        history.replaceState(null, '', hash);
      }}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </a>
  );

  const openDialogue = () => {
    if (state.chat) {
      act.update({ route: 'chat' });
      history.replaceState(null, '', '#chat');
      return;
    }
    const s = state.mySessions.find((x) => x.status === 'active') ?? state.mySessions[0];
    if (s) void act.openChat(s.id, s.agentPresetId);
  };

  return (
    <aside className="app-sidebar">
      <BrandMark />
      <nav className="app-nav" aria-label="工作台">
        {go('store', 'Agent 市集', '#store', '🏪')}
        <button
          type="button"
          className={'nav-item' + (route === 'chat' ? ' active' : '')}
          onClick={openDialogue}
        >
          <span aria-hidden="true">💬</span>
          对话
          {state.mySessions.length > 0 ? <span className="nav-badge">{state.mySessions.length}</span> : null}
        </button>
        {go('skills', '技能', '#skills', '🧩')}
        {kbMgr ? (fullAdmin ? go('admin', '管理', '#admin', '🛠') : go('admin', '知识库', '#admin/kb', '📚')) : null}
        {pending > 0 ? (
          <span className="nav-item nav-item--hint" aria-live="polite">
            <span aria-hidden="true">✅</span>
            待审批
            <span className="nav-badge">{pending}</span>
          </span>
        ) : null}
      </nav>
      <div className="app-sidebar-foot">
        {state.me ? (
          <div className="who">
            <InboxBell state={state} act={act} />
            <span>{state.me.name}</span>
            <span className="role">{state.me.role}</span>
            <a href="#" onClick={(e) => { e.preventDefault(); act.logout(); }}>退出</a>
          </div>
        ) : null}
        <ThemeToggle />
      </div>
    </aside>
  );
}

function InboxBell({ state, act }: { state: AppState; act: Actions }) {
  const unread = state.inboxUnread;
  return (
    <details className="inbox">
      <summary title="站内通知">
        通知{unread ? <span className="inbox-count">{unread}</span> : null}
      </summary>
      <div className="inbox-panel">
        {state.inbox.length === 0 ? <p className="muted">没有通知</p> : (
          <ul className="plain">
            {state.inbox.slice(0, 12).map((n) => (
              <li key={n.id} className={n.readAt ? 'muted' : ''}>
                {n.kind}
              </li>
            ))}
          </ul>
        )}
        {unread ? <button className="ghost" onClick={() => void act.markInboxRead()}>全部已读</button> : null}
      </div>
    </details>
  );
}

function LoginView({ state, act }: { state: AppState; act: Actions }) {
  return (
    <div className="login-stage">
      <LoginIllustration />
      <div className="login card">
        <p className="eyebrow">企业试点</p>
        <h2>进入森米工作台</h2>
        <p className="login-lead">用钉钉账号登录，挑选 Agent 开始对话。</p>
        <a className="sso" href="/api/auth/sso/login">使用钉钉登录</a>
        {state.showDevLogin ? (
          <div className="dev-login">
            <div className="row">
              <input
                placeholder="用户 id（u-admin / u-dev-1 / u-hr-1）"
                value={state.loginUser}
                onChange={(e) => act.update({ loginUser: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') void act.login(); }}
              />
              <button onClick={() => void act.login()}>{state.loading ? '…' : '登录'}</button>
            </div>
            <div className="hint">开发认证 · 控制面 {API_HOST_DISPLAY}</div>
          </div>
        ) : (
          <button className="ghost" onClick={() => act.update({ showDevLogin: true })}>本地开发登录</button>
        )}
      </div>
    </div>
  );
}
