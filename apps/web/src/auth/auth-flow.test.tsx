import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
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
});
