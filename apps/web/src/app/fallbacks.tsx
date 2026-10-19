import { Link, useRouteError } from 'react-router';

export function NotFound() {
  return (
    <section className="page">
      <h1>Page not found</h1>
      <p>
        <Link to="/orders">Back to orders</Link>
      </p>
    </section>
  );
}

export function RouteError() {
  const error = useRouteError();
  console.error(error);
  return (
    <main className="full-page-message" role="alert">
      <h1>Something went wrong</h1>
      <p>The page hit an unexpected error. Reloading usually fixes it.</p>
      <button type="button" className="button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </main>
  );
}
