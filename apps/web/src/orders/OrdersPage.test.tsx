import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { adminUser, makeOrderDetail, makeOrders, makePage } from '../test/fixtures';
import { renderApp } from '../test/render';
import { server } from '../test/server';

const bodyRows = () => screen.getAllByRole('row').slice(1);

function recordListRequests(respond: (params: URLSearchParams) => ReturnType<typeof makePage>) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get('/api/orders', ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      return HttpResponse.json(respond(params));
    }),
  );
  return requests;
}

describe('OrdersPage', () => {
  it('renders the first page with its total and announces it', async () => {
    renderApp('/orders');
    expect(await screen.findByRole('link', { name: '#50000' })).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(20);
    expect(screen.getByRole('status')).toHaveTextContent('20 orders');
    const firstRow = within(bodyRows()[0]!);
    expect(firstRow.getByText('Customer 50000')).toBeInTheDocument();
    expect(firstRow.getByText(/SAR\s123\.45/)).toBeInTheDocument();
  });

  it('restores filters and sort from the URL and sends them to the API', async () => {
    const requests = recordListRequests(() => makePage(makeOrders(3, 'cancelled')));
    renderApp('/orders?status=cancelled&sort=total&dir=asc&q=huda');

    await screen.findByRole('link', { name: '#50000' });
    expect(screen.getByRole('radio', { name: 'Cancelled' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('total:asc');
    expect(screen.getByRole('searchbox', { name: 'Search orders' })).toHaveValue('huda');
    expect(Object.fromEntries(requests[0]!)).toMatchObject({
      status: 'cancelled',
      sort: 'total',
      dir: 'asc',
      q: 'huda',
      limit: '50',
    });
    expect(screen.getByRole('columnheader', { name: 'Total' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('debounces search: the URL follows every keystroke, the API gets one request', async () => {
    const requests = recordListRequests(() => makePage(makeOrders(2)));
    const { events, router } = renderApp('/orders');
    await screen.findByRole('link', { name: '#50000' });

    await events.type(screen.getByRole('searchbox', { name: 'Search orders' }), 'huda');
    expect(router.state.location.search).toBe('?q=huda');

    await waitFor(() => expect(requests.map((params) => params.get('q'))).toEqual([null, 'huda']));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(requests).toHaveLength(2);
  });

  it('never drops keystrokes, even when the agent types faster than the URL can update', async () => {
    const requests = recordListRequests(() => makePage(makeOrders(2)));
    renderApp('/orders');
    await screen.findByRole('link', { name: '#50000' });
    const box = screen.getByRole('searchbox', { name: 'Search orders' });

    // delay: null dispatches every keystroke back to back, without yielding in between.
    await userEvent.setup({ delay: null }).type(box, 'mohammed.alharbi');

    expect(box).toHaveValue('mohammed.alharbi');
    await waitFor(() => expect(requests.at(-1)?.get('q')).toBe('mohammed.alharbi'));
  });

  it('changes the sort from the toolbar', async () => {
    const requests = recordListRequests(() => makePage(makeOrders(2)));
    const { events, router } = renderApp('/orders');
    await screen.findByRole('link', { name: '#50000' });

    await events.selectOptions(
      screen.getByRole('combobox', { name: 'Sort' }),
      'Amount: high to low',
    );
    await waitFor(() => expect(requests.at(-1)?.get('sort')).toBe('total'));
    expect(requests.at(-1)?.get('dir')).toBe('desc');
    expect(router.state.location.search).toBe('?sort=total');
  });

  it('loads the next page with its cursor while the agent scrolls, rendering only visible rows', async () => {
    const requests = recordListRequests((params) =>
      params.get('cursor')
        ? makePage(makeOrders(150, 'paid', 49_900), { total: null })
        : makePage(makeOrders(20), {
            nextCursor: 'cursor-2',
            total: { count: 170, capped: false },
          }),
    );
    renderApp('/orders');

    await waitFor(() =>
      expect(requests.map((params) => params.get('cursor'))).toEqual([null, 'cursor-2']),
    );
    expect(await screen.findByRole('link', { name: '#49900' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Orders' })).toHaveAttribute('aria-rowcount', '171');
    // 170 rows loaded, but only the viewport (≈14 rows) plus overscan is in the DOM.
    expect(bodyRows().length).toBeLessThan(40);
  });

  it('shows "10,000+" when the server stopped counting', async () => {
    recordListRequests(() =>
      makePage(makeOrders(5), { nextCursor: 'more', total: { count: 10_000, capped: true } }),
    );
    renderApp('/orders');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('10,000+ orders'));
    expect(screen.getByRole('table', { name: 'Orders' })).toHaveAttribute('aria-rowcount', '-1');
  });

  it('shows an error with a working Retry when the list cannot load', async () => {
    let fail = true;
    server.use(
      http.get('/api/orders', () =>
        fail
          ? HttpResponse.json(
              {
                error: {
                  code: 'internal_error',
                  message: 'Something went wrong. Please try again.',
                },
              },
              { status: 500 },
            )
          : HttpResponse.json(makePage(makeOrders(3))),
      ),
    );
    const { events } = renderApp('/orders');
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load orders');

    fail = false;
    await events.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(bodyRows()).toHaveLength(3));
  });

  it('offers to clear the filters when nothing matches', async () => {
    recordListRequests((params) => makePage(params.get('q') ? [] : makeOrders(2)));
    const { events, router } = renderApp('/orders?q=nobody&status=paid');

    expect(await screen.findByText('No orders match these filters.')).toBeInTheDocument();
    await events.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    expect(router.state.location.search).toBe('');
  });

  it('opens an order in a panel and closes it with Escape, keeping the filters', async () => {
    server.use(
      http.get('/api/orders/:id', ({ params }) =>
        HttpResponse.json(makeOrderDetail({ id: Number(params.id) })),
      ),
    );
    const { events, router } = renderApp('/orders?status=paid');

    await events.click(await screen.findByRole('link', { name: '#50000' }));
    const panel = await screen.findByRole('dialog', { name: 'Order #50000' });
    expect(await within(panel).findByText('Sukkari Dates Gift Box')).toBeInTheDocument();
    expect(within(panel).getByText(/by Omar Haddad/)).toBeInTheDocument();
    // Agents never see the delete control (and the server would refuse anyway).
    expect(within(panel).queryByRole('button', { name: 'Delete order' })).not.toBeInTheDocument();

    await events.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location).toMatchObject({ pathname: '/orders', search: '?status=paid' });
  });

  it('lets an admin delete an order after confirming', async () => {
    const deleted: string[] = [];
    server.use(
      http.get('/api/orders/:id', ({ params }) =>
        HttpResponse.json(makeOrderDetail({ id: Number(params.id) })),
      ),
      http.delete('/api/orders/:id', ({ params }) => {
        deleted.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { events } = renderApp('/orders/50000', { user: adminUser });

    const panel = await screen.findByRole('dialog', { name: 'Order #50000' });
    await events.click(await within(panel).findByRole('button', { name: 'Delete order' }));
    await events.click(within(panel).getByRole('button', { name: 'Yes, delete' }));

    expect(await screen.findByText('Order #50000 was deleted.')).toBeInTheDocument();
    expect(deleted).toEqual(['50000']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sends the agent to the login page when the session expires', async () => {
    server.use(
      http.get('/api/orders', () =>
        HttpResponse.json(
          { error: { code: 'session_expired', message: 'Your session has expired.' } },
          { status: 401 },
        ),
      ),
    );
    const { router } = renderApp('/orders?status=paid');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/orders?status=paid')}`);
  });
});
