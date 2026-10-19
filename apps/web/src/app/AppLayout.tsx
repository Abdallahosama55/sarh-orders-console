import { lazy, Suspense } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useCurrentUser, useLogout } from '../auth/session';

// `import.meta.env.DEV` is replaced by `false` in production builds, so the toolbar's chunk
// is never even emitted there.
const DevToolbar = import.meta.env.DEV ? lazy(() => import('../dev/DevToolbar')) : null;

export function AppLayout() {
  const user = useCurrentUser();
  const logout = useLogout();
  const { pathname } = useLocation();
  const section = pathname.startsWith('/orders/new')
    ? 'new'
    : pathname.startsWith('/orders')
      ? 'orders'
      : pathname.startsWith('/stats')
        ? 'stats'
        : null;

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/orders" className="brand">
          <span className="brand__mark">SARH</span> Orders Console
        </Link>
        <nav aria-label="Main" className="nav">
          <Link to="/orders" aria-current={section === 'orders' ? 'page' : undefined}>
            Orders
          </Link>
          <Link to="/orders/new" aria-current={section === 'new' ? 'page' : undefined}>
            New order
          </Link>
          <Link to="/stats" aria-current={section === 'stats' ? 'page' : undefined}>
            Overview
          </Link>
        </nav>
        <div className="user-menu">
          <span className="user-menu__name">{user.name}</span>
          <span className={`role role--${user.role}`}>{user.role}</span>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      {DevToolbar && (
        <Suspense fallback={null}>
          <DevToolbar />
        </Suspense>
      )}
    </div>
  );
}
