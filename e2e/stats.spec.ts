// O1 in a real browser: the slow report never blocks, is cancelled on navigation, fails visibly.
import { AGENT, expect, signIn, test } from './fixtures';

const isStats = (url: URL) => url.pathname === '/api/orders/stats';

test.describe('stats', () => {
  test('loads without blocking navigation, then shows the numbers', async ({ page }) => {
    await signIn(page, AGENT, '/stats');
    await expect(page.getByText(/Loading stats…/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Orders', exact: true })).toBeEnabled();
    await expect(page.getByText('Revenue today')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Delivered', { exact: true })).toBeVisible();
  });

  test('navigating away cancels the in-flight request', async ({ page }) => {
    await signIn(page, AGENT);
    const cancelled = page.waitForEvent('requestfailed', (request) =>
      isStats(new URL(request.url())),
    );

    await page.getByRole('link', { name: 'Overview' }).click();
    await expect(page.getByText(/Loading stats…/)).toBeVisible();
    await page.getByRole('link', { name: 'Orders', exact: true }).click();

    expect((await cancelled).failure()?.errorText).toBe('net::ERR_ABORTED');
    await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible();
  });

  test('a failure shows an error state, and Retry recovers with one new request', async ({
    page,
  }) => {
    let failing = true;
    let requests = 0;
    await page.route(
      (url) => isStats(url),
      async (route) => {
        requests += 1;
        if (!failing) return route.continue();
        return route.fulfill({
          status: 503,
          json: {
            error: { code: 'simulated_failure', message: 'The stats service is unavailable.' },
          },
        });
      },
    );
    await signIn(page, AGENT, '/stats');

    await expect(page.getByRole('alert')).toContainText('Couldn’t load the stats');
    expect(requests).toBe(1); // no silent automatic retries

    failing = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('Revenue today')).toBeVisible({ timeout: 10_000 });
    expect(requests).toBe(2);
  });
});
