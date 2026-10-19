// R1-8, second line of defence: even if a superseded request is *not* cancelled on the
// network (its response was already on the wire, or a client ignores the signal), its late
// result must still never replace what the screen shows for the latest filters.
import type { ListOrdersResponse } from '@orders/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeOrders, makePage } from '../test/fixtures';
import { renderApp } from '../test/render';
import type * as OrdersApi from './orders-api';
import { listOrders } from './orders-api';

vi.mock('./orders-api', async (importOriginal) => ({
  ...(await importOriginal<typeof OrdersApi>()),
  listOrders: vi.fn(),
}));

const visibleStatuses = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[2]?.textContent);

describe('orders list: a late response that was never cancelled', () => {
  it('cannot overwrite the result of the latest filter', async () => {
    // Each request stays open until the test answers it, and ignores its AbortSignal.
    const answer = new Map<string, (page: ListOrdersResponse) => void>();
    vi.mocked(listOrders).mockImplementation(
      (filters) => new Promise((resolve) => answer.set(filters.status ?? 'all', resolve)),
    );

    const { events } = renderApp('/orders');
    await waitFor(() => expect(answer.has('all')).toBe(true));
    act(() => answer.get('all')!(makePage(makeOrders(3, 'pending'))));
    await waitFor(() => expect(visibleStatuses()).toEqual(['Pending', 'Pending', 'Pending']));

    await events.click(screen.getByRole('radio', { name: 'Paid' }));
    await events.click(screen.getByRole('radio', { name: 'Cancelled' }));
    await waitFor(() => expect(answer.has('cancelled')).toBe(true));

    // The latest request answers first…
    act(() => answer.get('cancelled')!(makePage(makeOrders(3, 'cancelled'))));
    await waitFor(() => expect(visibleStatuses()).toEqual(['Cancelled', 'Cancelled', 'Cancelled']));

    // …then the superseded one finally answers.
    act(() => answer.get('paid')!(makePage(makeOrders(3, 'paid'))));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(visibleStatuses()).toEqual(['Cancelled', 'Cancelled', 'Cancelled']);
    expect(screen.getByRole('status')).toHaveTextContent('3 orders · Cancelled');
  });
});
