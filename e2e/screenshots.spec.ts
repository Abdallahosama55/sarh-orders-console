// `npm run screenshots` — regenerates docs/screenshots/*.png from the running E2E stack.
// The request-log overlay and the terminal frame are added by this script for the pictures;
// they are not part of the app. The proof output is captured live from `npm run proof:duplicates`.
import { execFileSync } from 'node:child_process';
import { ADMIN, AGENT, expect, signIn, test } from './fixtures';

const OUT = 'docs/screenshots';

test.describe.configure({ mode: 'serial' });

test('orders list at 50,000 rows', async ({ page }) => {
  await signIn(page, AGENT);
  await expect(page.getByRole('status')).toHaveText('10,000+ orders');
  await page.screenshot({ path: `${OUT}/01-orders-list.png` });
});

test('rapid filter test with out-of-order responses', async ({ page }) => {
  await signIn(page, AGENT);
  await expect(page.getByRole('status')).toHaveText('10,000+ orders');
  const heldMs: Record<string, number> = { paid: 1_500, shipped: 800 };
  await page.route(
    (url) => url.pathname === '/api/orders',
    async (route) => {
      const status = new URL(route.request().url()).searchParams.get('status') ?? '';
      if (heldMs[status]) await new Promise((resolve) => setTimeout(resolve, heldMs[status]));
      await route.continue().catch(() => {});
    },
  );
  const log: string[] = [];
  page.on('requestfailed', (request) => {
    const status = new URL(request.url()).searchParams.get('status');
    log.push(
      `status=${status}  held ${(heldMs[status ?? ''] ?? 0) / 1000}s by the test → ${request.failure()?.errorText}  (aborted, never rendered)`,
    );
  });
  page.on('requestfinished', async (request) => {
    const url = new URL(request.url());
    if (url.pathname !== '/api/orders') return;
    const response = await request.response();
    log.push(
      `status=${url.searchParams.get('status')}  → ${response?.status()}  (latest request: rendered)`,
    );
  });

  await page.getByRole('radio', { name: 'Paid' }).click();
  await page.getByRole('radio', { name: 'Shipped' }).click();
  await page.getByRole('radio', { name: 'Cancelled' }).click();
  await expect(page.getByRole('status')).toContainText('· Cancelled');
  await page.waitForTimeout(1_800);

  await page.evaluate((lines) => {
    const overlay = document.createElement('pre');
    overlay.textContent = [
      'Clicked Paid → Shipped → Cancelled within ~100 ms. Playwright held the earlier requests',
      'longest so their answers would arrive last. What happened to each request:',
      '',
      ...lines,
    ].join('\n');
    Object.assign(overlay.style, {
      position: 'fixed',
      right: '24px',
      bottom: '24px',
      zIndex: '99',
      margin: '0',
      padding: '14px 16px',
      background: '#1b2232',
      color: '#e8ebf2',
      font: '12px/1.6 ui-monospace, Menlo, monospace',
      borderRadius: '10px',
      boxShadow: '0 12px 32px rgb(0 0 0 / 30%)',
      whiteSpace: 'pre',
    });
    document.body.append(overlay);
  }, log);
  await page.screenshot({ path: `${OUT}/02-rapid-filter-test.png` });
});

test('R2 duplicate proof (terminal output)', async ({ page }) => {
  const output = execFileSync('npm', ['run', '--silent', 'proof:duplicates'], { encoding: 'utf8' });
  await page.setViewportSize({ width: 1180, height: 900 });
  await page.setContent(`<!doctype html><meta charset="utf-8">
    <body style="margin:0;padding:24px;background:#eef0f5">
      <div id="term" style="width:1100px;border-radius:12px;overflow:hidden;box-shadow:0 12px 32px rgb(0 0 0/25%)">
        <div style="background:#2b3242;color:#c5cad6;font:12px system-ui;padding:8px 14px">npm run proof:duplicates</div>
        <pre id="out" style="margin:0;padding:18px;background:#141925;color:#e8ebf2;font:13px/1.55 ui-monospace,Menlo,monospace;white-space:pre-wrap"></pre>
      </div>
    </body>`);
  await page.locator('#out').evaluate((element, text) => {
    element.textContent = `$ npm run proof:duplicates\n${text.trimEnd()}`;
  }, output);
  await page.locator('#term').screenshot({ path: `${OUT}/03-duplicate-proof.png` });
});

test('order details as an admin', async ({ page }) => {
  await signIn(page, ADMIN, '/orders/4242');
  await expect(page.getByRole('dialog', { name: 'Order #4242' })).toContainText('Line total');
  await page.screenshot({ path: `${OUT}/04-order-details-admin.png` });
});

test('create order', async ({ page }) => {
  await signIn(page, AGENT, '/orders/new');
  await page.getByLabel('Customer name').fill('Huda Al-Qahtani');
  await page.getByLabel('Customer email').fill(`huda.q.${Date.now()}@example.com`);
  await page.getByLabel('Product 1').fill('Sukkari Dates Gift Box');
  await page.getByLabel('Quantity 1').fill('2');
  await page.getByLabel('Unit price 1').fill('95');
  await page.getByRole('button', { name: '+ Add item' }).click();
  await page.getByLabel('Product 2').fill('Arabic Coffee Dallah');
  await page.getByLabel('Unit price 2').fill('120');
  await page.screenshot({ path: `${OUT}/05-create-order.png` });
  await page.getByRole('button', { name: 'Create order' }).dblclick();
  await expect(page.getByRole('heading', { name: /^Order #\d+ created$/ })).toBeVisible();
  await page.screenshot({ path: `${OUT}/06-order-created.png` });
});

test('slow stats', async ({ page }) => {
  await signIn(page, AGENT, '/stats');
  await expect(page.getByText(/Loading stats…/)).toBeVisible();
  await page.screenshot({ path: `${OUT}/07-stats-loading.png` });
  await expect(page.getByText('Revenue today')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${OUT}/08-stats.png` });
});
