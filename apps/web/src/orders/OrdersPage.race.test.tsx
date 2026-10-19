// R1-8 · "Change the filter three times in quick succession. The result of an earlier, slower
// request must never overwrite the result of the latest one."
import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { makeOrders, makePage } from '../test/fixtures';
import { renderApp } from '../test/render';
import { server } from '../test/server';

function visibleStatuses(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1) // header row
    .map((row) => within(row).getAllByRole('cell')[2]?.textContent ?? '');
}

describe('orders list: latest filter wins', () => {
  it('shows only the last filter when earlier, slower responses arrive after it, and aborts them', async () => {
    const requests: Array<{ status: string; signal: AbortSignal }> = [];
    // The earlier the click, the slower the answer: the worst possible arrival order.
    const latencyMs: Record<string, number> = { all: 0, paid: 400, shipped: 200, cancelled: 0 };
    server.use(
      http.get('/api/orders', async ({ request }) => {
        const status = new URL(request.url).searchParams.get('status') ?? 'all';
        requests.push({ status, signal: request.signal });
        await delay(latencyMs[status]);
        return HttpResponse.json(
          makePage(makeOrders(5, status === 'all' ? 'pending' : (status as never))),
        );
      }),
    );

    const { events } = renderApp('/orders');
    await waitFor(() => expect(visibleStatuses()).toEqual(Array(5).fill('Pending')));

    await events.click(screen.getByRole('radio', { name: 'Paid' }));
    await events.click(screen.getByRole('radio', { name: 'Shipped' }));
    await events.click(screen.getByRole('radio', { name: 'Cancelled' }));

    await waitFor(() => expect(visibleStatuses()).toEqual(Array(5).fill('Cancelled')));
    // Wait until the slow "paid" and "shipped" answers would have landed.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(visibleStatuses()).toEqual(Array(5).fill('Cancelled'));
    expect(screen.getByRole('radio', { name: 'Cancelled' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('5 orders · Cancelled');
    expect(requests.map(({ status }) => status)).toEqual(['all', 'paid', 'shipped', 'cancelled']);
    expect(requests.find(({ status }) => status === 'paid')?.signal.aborted).toBe(true);
    expect(requests.find(({ status }) => status === 'shipped')?.signal.aborted).toBe(true);
    expect(requests.find(({ status }) => status === 'cancelled')?.signal.aborted).toBe(false);
  });

  it('never shows the previous filter’s rows while the new filter is loading', async () => {
    server.use(
      http.get('/api/orders', async ({ request }) => {
        const status = new URL(request.url).searchParams.get('status');
        if (status === 'paid') await delay(300);
        return HttpResponse.json(makePage(makeOrders(3, status === 'paid' ? 'paid' : 'pending')));
      }),
    );
    const { events } = renderApp('/orders');
    await waitFor(() => expect(visibleStatuses()).toEqual(['Pending', 'Pending', 'Pending']));

    await events.click(screen.getByRole('radio', { name: 'Paid' }));

    // Loading: skeleton only, no stale "Pending" rows under a "Paid" filter.
    expect(screen.getAllByRole('row')).toHaveLength(1);
    expect(screen.getByRole('table', { name: 'Orders' })).toHaveAttribute('aria-busy', 'true');
    await waitFor(() => expect(visibleStatuses()).toEqual(['Paid', 'Paid', 'Paid']));
  });
});
