import { useEffect } from 'react';
import { useApp, API_HOST_DISPLAY, type Actions } from './useApp';
import { SectionHead } from './ui';
import StoreView from './StoreView';
import AdminView from './AdminView';
import type { Client } from './store-client';
import type { AppState } from './types';

export default function App({ client }: { client?: Client }) {
  const { state, act } = useApp(client);
  const isAdmin = state.me?.role === 'admin';
  const route = isAdmin ? state.route : 'store';

  // Deep-link / back-forward sync.
  useEffect(() => {
    const onHash = () => {
      const want = location.hash === '#admin' ? 'admin' : 'store';
      if (state.me?.role === 'admin' && state.route !== want) act.update({ route: want });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [state.me?.role, state.route, act]);

  return (
    <div className="shell">
      <Topbar isAdmin={isAdmin} route={route} state={state} act={act} />
      <main className="main">
        {!state.me ? (
          <LoginView state={state} act={act} />
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

function Topbar({ isAdmin, route, state, act }: { isAdmin: boolean; route: string; state: AppState; act: Actions }) {
  const nav = (key: 'store' | 'admin', label: string) => (
    <a
      className={route === key ? 'active' : ''}
      href={'#' + key}
      onClick={(e) => {
        e.preventDefault();
        act.update({ route: key });
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
        <span className="tag">probe bench</span>
      </div>
      {isAdmin ? (
        <nav className="nav">
          {nav('store', '商店')}
          {nav('admin', '管理')}
        </nav>
      ) : null}
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
      <SectionHead idx="AUTH" title="登录" />
      <div className="row">
        <input
          placeholder="用户 id（u-admin / u-dev-1 / u-hr-1）"
          value={state.loginUser}
          onChange={(e) => act.update({ loginUser: e.target.value })}
        />
        <button onClick={() => void act.login()}>{state.loading ? '…' : '登录（dev）'}</button>
      </div>
      <div className="hint">{'本地演示版（dev 认证）\n控制面 ' + API_HOST_DISPLAY}</div>
    </div>
  );
}
