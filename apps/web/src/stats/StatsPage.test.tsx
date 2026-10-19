// O1: a slow report that never blocks the UI, is cancelled on navigation, and fails visibly.
import { screen, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { makeStats } from '../test/fixtures';
import { renderApp } from '../test/render';
import { server } from '../test/server';

describe('StatsPage', () => {
  it('renders straight away with a loading state, keeps navigation usable, then shows the numbers', async () => {
    server.use(
      http.get('/api/orders/stats', async () => {
        await delay(300);
        return HttpResponse.json(makeStats());
      }),
    );
    renderApp('/stats');

    expect(await screen.findByText(/Loading stats…/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Orders' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'New order' })).toBeVisible();

    expect(await screen.findByText('42,108')).toBeInTheDocument(); // delivered orders
    expect(screen.getByText(/SAR\s42,500\.00/)).toBeInTheDocument(); // revenue today
    expect(
      screen.getByText(/212 paid, shipped or delivered orders since midnight \(Asia\/Riyadh\)/),
    ).toBeInTheDocument();
  });

  it('cancels the in-flight request when the agent navigates away (O1-3)', async () => {
    let requestSignal: AbortSignal | undefined;
    server.use(
      http.get('/api/orders/stats', async ({ request }) => {
        requestSignal = request.signal;
        await delay(2_000);
        return HttpResponse.json(makeStats());
      }),
    );
    const { events } = renderApp('/stats');
    await screen.findByText(/Loading stats…/);
    await waitFor(() => expect(requestSignal).toBeDefined());
    expect(requestSignal?.aborted).toBe(false);

    await events.click(screen.getByRole('link', { name: 'Orders' }));

    expect(await screen.findByRole('heading', { name: 'Orders' })).toBeInTheDocument();
    await waitFor(() => expect(requestSignal?.aborted).toBe(true));
  });

  it('shows an error state whose single Retry sends exactly one new request (no silent retries)', async () => {
    let calls = 0;
    server.use(
      http.get('/api/orders/stats', async () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            { error: { code: 'simulated_failure', message: 'The stats service is unavailable.' } },
            { status: 503 },
          );
        }
        await delay(100);
        return HttpResponse.json(makeStats());
      }),
    );
    // Production retry policy on purpose: a 503 is normally retried, so this proves the stats
    // query itself opts out of automatic retries.
    const { events } = renderApp('/stats', { productionRetries: true });

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load the stats');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(calls).toBe(1);

    await events.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/Loading stats…/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument(); // cannot stack retries
    expect(await screen.findByText('42,108')).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('keeps the last numbers on screen when a refresh fails', async () => {
    let calls = 0;
    server.use(
      http.get('/api/orders/stats', async () => {
        calls += 1;
        await delay(50);
        return calls === 1
          ? HttpResponse.json(makeStats())
          : HttpResponse.json(
              {
                error: { code: 'simulated_failure', message: 'The stats service is unavailable.' },
              },
              { status: 503 },
            );
      }),
    );
    const { events } = renderApp('/stats');
    expect(await screen.findByText('42,108')).toBeInTheDocument();

    await events.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t refresh the stats; showing the last numbers.',
    );
    expect(screen.getByText('42,108')).toBeInTheDocument();
  });
});
