import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from './session';

export function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) {
    return <p className="full-page-message">Loading…</p>;
  }
  if (session.isError) {
    return (
      <div className="full-page-message" role="alert">
        <p>Could not reach the server.</p>
        <button type="button" className="button" onClick={() => void session.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  if (!session.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}
