import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { routes as appRoutes } from '../app/routes';
import { agentUser } from '../test/fixtures';
import { renderApp } from '../test/render';
import { server } from '../test/server';

describe('sign-in flow', () => {
  it('redirects to the login page, then back to the requested page after signing in', async () => {
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        const { password } = (await request.json()) as { password: string };
        return password === 'Agent#2026'
          ? HttpResponse.json({ user: agentUser })
          : HttpResponse.json(
              { error: { code: 'invalid_credentials', message: 'Wrong email or password.' } },
              { status: 401 },
            );
      }),
    );
    const { events, router } = renderApp('/orders?status=paid', { user: null });

    expect(await screen.findByRole('heading', { name: 'Orders Console' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');

    await events.type(screen.getByLabelText('Email'), 'agent@sarh.test');
    await events.type(screen.getByLabelText('Password'), 'wrong');
    await events.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.');

    await events.clear(screen.getByLabelText('Password'));
    await events.type(screen.getByLabelText('Password'), 'Agent#2026');
    await events.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/orders'));
    expect(router.state.location.search).toBe('?status=paid');
    expect(await screen.findByText('Omar Haddad')).toBeInTheDocument();
  });

  it('validates the form before calling the API', async () => {
    let calls = 0;
    server.use(
      http.post('/api/auth/login', () => {
        calls += 1;
        return HttpResponse.json({ user: agentUser });
      }),
    );
    const { events } = renderApp('/login', { user: null });
    await events.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(calls).toBe(0);
  });

  it('signs out, clears the stored draft and returns to the login page', async () => {
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })));
    window.sessionStorage.setItem('orders-console:create-order-draft', '{"stale":true}');
    const { events, router } = renderApp('/orders');

    await events.click(await screen.findByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(window.sessionStorage.getItem('orders-console:create-order-draft')).toBeNull();
  });

  it('never renders the signed-in layout without a user, however late the navigation lands', async () => {
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })));
    // Hold the navigation to /login: sign-out must not rely on it winning a race (it lost on CI).
    let openLogin = () => {};
    const loginReady = new Promise<null>((resolve) => (openLogin = () => resolve(null)));
    const routes = appRoutes.map((route) =>
      route.path === '/login' ? { ...route, loader: () => loginReady } : route,
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { events, router } = renderApp('/orders', { routes });
      const signOut = await screen.findByRole('button', { name: 'Sign out' });
      await events.click(signOut);
      await waitFor(() => expect(router.state.navigation.state).toBe('loading'));
      // The layout re-renders when the sign-out settles, before /login has landed. That render
      // used to read the ended session and throw.
      await waitFor(() => expect(signOut).toBeEnabled());

      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
      expect(consoleError).not.toHaveBeenCalled();
      openLogin();
      await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    } finally {
      consoleError.mockRestore();
    }
  });
});
