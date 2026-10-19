// R2 in a real browser: whatever the agent or the network does, one submission = one order.
import type { Page } from '@playwright/test';
import { AGENT, expect, ordersFor, signIn, test } from './fixtures';

async function fillOrder(page: Page, email: string) {
  await page.getByLabel('Customer name').fill('E2E Customer');
  await page.getByLabel('Customer email').fill(email);
  await page.getByLabel('Product 1').fill('Sukkari Dates Gift Box');
  await page.getByLabel('Quantity 1').fill('2');
  await page.getByLabel('Unit price 1').fill('95');
  await expect(page.getByLabel('Order total')).toHaveText(/SAR\s190\.00/);
}

const uniqueEmail = (label: string) => `e2e.${label}.${Date.now()}@example.com`;
const isCreate = (url: URL) => url.pathname === '/api/orders';

test.describe('create order', () => {
  test('double-clicking "Create order" creates exactly one order', async ({ page }) => {
    const email = uniqueEmail('double');
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && isCreate(new URL(request.url())))
        posts.push(request.url());
    });
    await signIn(page, AGENT, '/orders/new');
    await fillOrder(page, email);

    await page.getByRole('button', { name: 'Create order' }).dblclick();

    await expect(page.getByRole('heading', { name: /^Order #\d+ created$/ })).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(await ordersFor(page, email)).toHaveLength(1);
  });

  test.describe('when the response is lost on the way back', () => {
    test.use({ allowConsoleErrors: [/net::ERR_CONNECTION_RESET/] });

    test('a lost response is retried with the same key: the order exists once and is shown', async ({
      page,
    }) => {
      const email = uniqueEmail('lost');
      const keys: string[] = [];
      let first = true;
      await page.route(
        (url) => isCreate(url),
        async (route) => {
          if (route.request().method() !== 'POST') return route.fallback();
          keys.push(route.request().headers()['idempotency-key'] ?? '');
          if (first) {
            first = false;
            await route.fetch(); // the server receives it and creates the order…
            return route.abort('connectionreset'); // …but the browser never hears back
          }
          return route.continue();
        },
      );
      await signIn(page, AGENT, '/orders/new');
      await fillOrder(page, email);

      await page.getByRole('button', { name: 'Create order' }).click();

      await expect(page.getByRole('heading', { name: /^Order #\d+ created$/ })).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        page.getByText('This order had already reached the server, so it was not created twice.'),
      ).toBeVisible();
      expect(keys).toHaveLength(2);
      expect(keys[1]).toBe(keys[0]);
      expect(await ordersFor(page, email)).toHaveLength(1);
    });
  });

  test('reloading mid-draft keeps the same key, so resubmitting cannot duplicate', async ({
    page,
  }) => {
    const email = uniqueEmail('reload');
    const keys: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && isCreate(new URL(request.url()))) {
        keys.push(request.headers()['idempotency-key'] ?? '');
      }
    });
    // The first response is swallowed (unknown outcome); the agent reloads and submits again.
    let swallow = true;
    await page.route(
      (url) => isCreate(url),
      async (route) => {
        if (route.request().method() !== 'POST' || !swallow) return route.fallback();
        swallow = false;
        await route.fetch();
        await new Promise(() => {}); // never answer: the page will be reloaded
      },
    );
    await signIn(page, AGENT, '/orders/new');
    await fillOrder(page, email);
    await page.getByRole('button', { name: 'Create order' }).click();
    await expect(page.getByRole('button', { name: 'Creating…' })).toBeDisabled();

    await page.reload();
    await expect(page.getByLabel('Customer email')).toHaveValue(email);
    await page.getByRole('button', { name: 'Create order' }).click();

    await expect(page.getByRole('heading', { name: /^Order #\d+ created$/ })).toBeVisible();
    expect(new Set(keys).size).toBe(1);
    expect(await ordersFor(page, email)).toHaveLength(1);
  });

  test('invalid input is caught in the browser before any request', async ({ page }) => {
    let posts = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && isCreate(new URL(request.url()))) posts += 1;
    });
    await signIn(page, AGENT, '/orders/new');
    await page.getByRole('button', { name: 'Create order' }).click();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await expect(page.getByLabel('Customer email')).toHaveAttribute('aria-invalid', 'true');
    expect(posts).toBe(0);
  });
});
