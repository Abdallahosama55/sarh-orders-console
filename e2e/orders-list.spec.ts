// R1 in a real browser against the real API and 50,000 seeded orders.
import { AGENT, expect, signIn, statusCells, test } from './fixtures';

test.describe('orders list', () => {
  test('rapid filter changes: only the last filter is shown and superseded requests are aborted', async ({
    page,
  }) => {
    await signIn(page, AGENT);
    await expect(page.getByRole('status')).toHaveText('10,000+ orders');

    // Worst case: the earlier the click, the slower the answer, so stale answers arrive last.
    const delayMs: Record<string, number> = { paid: 1_500, shipped: 800 };
    await page.route(
      (url) => url.pathname === '/api/orders',
      async (route) => {
        const status = new URL(route.request().url()).searchParams.get('status') ?? '';
        if (delayMs[status]) await new Promise((resolve) => setTimeout(resolve, delayMs[status]));
        await route.continue().catch(() => {}); // the page may have aborted it meanwhile
      },
    );
    const aborted: string[] = [];
    page.on('requestfailed', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/orders')
        aborted.push(`${url.searchParams.get('status')} ${request.failure()?.errorText}`);
    });

    await page.getByRole('radio', { name: 'Paid' }).click();
    await page.getByRole('radio', { name: 'Shipped' }).click();
    await page.getByRole('radio', { name: 'Cancelled' }).click();

    await expect(page.getByRole('status')).toContainText('· Cancelled');
    await page.waitForTimeout(1_800); // until after the slowest stale answer would have landed
    const statuses = await statusCells(page).allInnerTexts();
    expect(statuses.length).toBeGreaterThan(10);
    expect(new Set(statuses)).toEqual(new Set(['Cancelled']));
    await expect(page.getByRole('radio', { name: 'Cancelled' })).toBeChecked();
    expect(aborted.sort()).toEqual(['paid net::ERR_ABORTED', 'shipped net::ERR_ABORTED']);
  });

  test('scrolling loads further pages by cursor while the DOM stays small and the order stays correct', async ({
    page,
  }) => {
    await signIn(page, AGENT);
    const cursors: string[] = [];
    page.on('request', (request) => {
      const cursor = new URL(request.url()).searchParams.get('cursor');
      if (cursor) cursors.push(cursor);
    });
    const scroller = page.locator('.orders-table__scroll');
    for (let step = 0; step < 10; step += 1) {
      await scroller.evaluate((element) => element.scrollBy(0, 2_500));
      await page.waitForTimeout(150);
    }
    expect(new Set(cursors).size).toBeGreaterThanOrEqual(3);
    expect(await page.getByRole('row').count()).toBeLessThan(60);
    const ids = (await page.locator('.order-link').allInnerTexts()).map((text) =>
      Number(text.slice(1)),
    );
    expect(ids).toEqual([...ids].sort((a, b) => b - a)); // newest first, no gaps in order
  });

  test('typing fast into search never drops characters', async ({ page }) => {
    await signIn(page, AGENT);
    const search = page.getByRole('searchbox', { name: 'Search orders' });
    await search.pressSequentially('mohammed.alharbi', { delay: 0 });
    await expect(search).toHaveValue('mohammed.alharbi');
    await expect(page).toHaveURL(/q=mohammed\.alharbi/);
    await expect(page.getByRole('status')).toContainText('matching “mohammed.alharbi”');
  });

  test('the view survives a reload because filters and sort live in the URL', async ({ page }) => {
    await signIn(page, AGENT, '/orders?status=cancelled&sort=total&dir=desc');
    await expect(page.getByRole('radio', { name: 'Cancelled' })).toBeChecked();
    const firstIds = await page.locator('.order-link').first().innerText();

    await page.reload();
    await expect(page.getByRole('radio', { name: 'Cancelled' })).toBeChecked();
    await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveValue('total:desc');
    await expect(page.locator('.order-link').first()).toHaveText(firstIds);
  });

  test('search finds customers by part of their name, in Arabic too, and by order number', async ({
    page,
  }) => {
    await signIn(page, AGENT);
    const search = page.getByRole('searchbox', { name: 'Search orders' });

    await search.fill('العتيبي');
    await expect(page.getByRole('status')).toContainText('matching');
    await expect(page.locator('.customer__name').first()).toContainText('العتيبي');

    await search.fill('#4242');
    await expect(page.getByRole('status')).toHaveText('1 order matching “#4242”');
    await expect(page.locator('.order-link')).toHaveText(['#4242']);
  });
});
