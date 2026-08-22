import { useEffect, useState } from 'react';
import { API_HOST_DISPLAY, parseLocation, useApp, type Actions } from './useApp';
import { applyTheme, readTheme, writeTheme, type Theme } from './theme';
import StoreView from './StoreView';
import AdminView from './AdminView';
import ChatView from './ChatView';
import type { Client } from './store-client';
import type { AdminPane, AppState } from './types';

export default function App({ client }: { client?: Client }) {
  const { state, act } = useApp(client);
  const isAdmin = state.me?.role === 'admin';
  const route = !state.me ? 'store' : (isAdmin || state.route !== 'admin' ? state.route : 'store');

  useEffect(() => {
    const onHash = () => {
      if (!state.me) return;
      const parsed = parseLocation(location.hash, state.me.role);
      if (parsed.route !== state.route || parsed.adminPane !== state.adminPane) {
        act.update({ route: parsed.route === 'chat' && !state.chat ? 'store' : parsed.route, adminPane: parsed.adminPane });
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [state.me, state.route, state.adminPane, state.chat, act]);

  return (
    <div className="shell">
      <Topbar isAdmin={isAdmin} route={route} state={state} act={act} />
      <main className="main">
        {!state.me ? (
          <LoginView state={state} act={act} />
        ) : route === 'chat' && state.chat ? (
          <ChatView state={state} act={act} />
        ) : route === 'admin' && isAdmin ? (
          <AdminView state={state} act={act} />
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

function Topbar({ isAdmin, route, state, act }: { isAdmin: boolean; route: string; state: AppState; act: Actions }) {
  const go = (key: 'store' | 'admin', label: string) => (
    <a
      className={route === key ? 'active' : ''}
      href={'#' + key}
      onClick={(e) => {
        e.preventDefault();
        const adminPane: AdminPane = key === 'admin' ? 'workbench' : state.adminPane;
        act.update({ route: key, adminPane, chat: key === 'store' ? null : state.chat });
        history.replaceState(null, '', '#' + key);
      }}
    >
      {label}
    </a>
  );

  return (
    <header className="topbar">
      <div className="brand">
        <span className="mark">◈</span>
        <span>AI Agent 平台</span>
        <span className="tag">试点</span>
      </div>
      {isAdmin ? (
        <nav className="nav">
          {go('store', '商店')}
          {go('admin', '管理')}
        </nav>
      ) : null}
      <ThemeToggle />
      {state.me ? (
        <div className="who">
          <span>{state.me.name}</span>
          <span className="role">{state.me.role}</span>
          <a href="#" onClick={(e) => { e.preventDefault(); act.logout(); }}>退出</a>
        </div>
      ) : null}
    </header>
  );
}

function LoginView({ state, act }: { state: AppState; act: Actions }) {
  return (
    <div className="login card">
      <h2>登录</h2>
      <p className="login-lead">用钉钉账号进入助手商店。本地开发可展开下面的开发登录。</p>
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
  );
}
