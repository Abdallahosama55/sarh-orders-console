import type { SessionUser } from '@orders/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
// RouterProvider comes from 'react-router' here, not 'react-router/dom' as in main.tsx: under
// Vitest the two entry points resolve to different builds of the library (CJS vs ESM chunks),
// which would give the app two router contexts. The only difference is flushSync scheduling,
// which jsdom cannot exercise anyway; the Playwright suite covers it in a real browser.
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { createQueryClient } from '../app/query-client';
import { routes as appRoutes } from '../app/routes';
import { agentUser } from './fixtures';
import { server } from './server';

interface RenderOptions {
  /** null = signed out. */
  user?: SessionUser | null;
  /** Use the production retry policy instead of failing fast (default: fail fast). */
  productionRetries?: boolean;
  /** The app's routes, or a variant of them (e.g. with a loader that holds a navigation). */
  routes?: RouteObject[];
}

/** Renders the real app (routes, query client, providers) at `path`, signed in as `user`. */
export function renderApp(
  path: string,
  { user = agentUser, productionRetries = false, routes = appRoutes }: RenderOptions = {},
) {
  server.use(
    http.get('/api/auth/me', () =>
      user
        ? HttpResponse.json({ user })
        : HttpResponse.json(
            { error: { code: 'unauthenticated', message: 'Please sign in.' } },
            { status: 401 },
          ),
    ),
  );
  const queryClient = createQueryClient(productionRetries ? {} : { retry: false });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const events = userEvent.setup();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router, queryClient, events };
}
