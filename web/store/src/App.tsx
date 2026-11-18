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
    <div className="shell">
      <Topbar kbMgr={kbMgr} fullAdmin={fullAdmin} kbOnly={kbOnly} route={route} state={state} act={act} />
      <main className={'main' + (!state.me ? ' main--login' : '') + (route === 'admin' ? ' main--wide' : '')}>
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

function Topbar({
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
  const go = (key: 'store' | 'admin' | 'skills', label: string, hash = '#' + key) => (
    <a
      className={route === key ? 'active' : ''}
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
      {label}
    </a>
  );

  return (
    <header className="topbar">
      <div className="brand">
        <span className="mark">◈</span>
        <span>小彼恩dsh</span>
        <span className="tag">试点</span>
      </div>
      {state.me ? (
        <nav className="nav">
          {go('store', '商店')}
          {go('skills', '技能')}
          {kbMgr ? (fullAdmin ? go('admin', '管理') : go('admin', '知识库', '#admin/kb')) : null}
        </nav>
      ) : null}
      <ThemeToggle />
      {state.me ? (
        <div className="who">
          <InboxBell state={state} act={act} />
          <span>{state.me.name}</span>
          <span className="role">{state.me.role}</span>
          <a href="#" onClick={(e) => { e.preventDefault(); act.logout(); }}>退出</a>
        </div>
      ) : null}
    </header>
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
        <h2>进入助手商店</h2>
        <p className="login-lead">用钉钉账号登录，选择已上架的 AI 助手开始对话。</p>
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
