/* global document */
// `npm run demo:record` — records docs/demo/orders-console-demo.webm against a running `npm run dev`
// (reseed first so "Revenue today" has orders: `npm run seed`, then restart dev).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5173';
const REPO = process.cwd();
const OUT_DIR = path.join(REPO, 'docs/demo');
const TMP = path.join(OUT_DIR, '.raw');
mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: TMP, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
const pause = (ms) => page.waitForTimeout(ms);

async function caption(title, detail = '') {
  await page.evaluate(
    ([t, d]) => {
      let box = document.getElementById('demo-caption');
      if (!box) {
        box = document.createElement('div');
        box.id = 'demo-caption';
        Object.assign(box.style, {
          position: 'fixed',
          right: '16px',
          bottom: '16px',
          width: '600px',
          zIndex: '1000',
          padding: '12px 16px',
          borderRadius: '12px',
          background: 'rgba(27,34,50,.94)',
          color: '#fff',
          font: '14px/1.45 system-ui, sans-serif',
          boxShadow: '0 12px 32px rgb(0 0 0 / 30%)',
          pointerEvents: 'none',
        });
        document.body.append(box);
      }
      box.innerHTML = '';
      const head = document.createElement('div');
      head.textContent = t;
      Object.assign(head.style, { fontWeight: '700', fontSize: '15px' });
      box.append(head);
      if (d) {
        const body = document.createElement('div');
        body.textContent = d;
        Object.assign(body.style, { marginTop: '4px', color: '#d7dbe6' });
        box.append(body);
      }
      const tag = document.createElement('div');
      tag.textContent = 'Automated demo · recorded with Playwright against the real app';
      Object.assign(tag.style, { marginTop: '8px', fontSize: '11px', color: '#9aa3b5' });
      box.append(tag);
    },
    [title, detail],
  );
}

async function requestLog(lines) {
  await page.evaluate(
    (text) => {
      let log = document.getElementById('demo-request-log');
      if (!log) {
        log = document.createElement('pre');
        log.id = 'demo-request-log';
        Object.assign(log.style, {
          position: 'fixed',
          right: '16px',
          top: '250px',
          zIndex: '1000',
          margin: '0',
          padding: '12px 14px',
          background: 'rgba(20,25,37,.95)',
          color: '#e8ebf2',
          font: '12px/1.6 ui-monospace, Menlo, monospace',
          borderRadius: '10px',
          boxShadow: '0 12px 32px rgb(0 0 0 / 30%)',
          pointerEvents: 'none',
        });
        document.body.append(log);
      }
      log.textContent = text;
    },
    ['Request log (Playwright)', ...lines].join('\n'),
  );
}

async function removeOverlay(id) {
  await page.evaluate((elementId) => document.getElementById(elementId)?.remove(), id);
}

async function fillOrder(email, { secondItem = false } = {}) {
  await page.getByLabel('Customer name').pressSequentially('Huda Al-Qahtani', { delay: 30 });
  await page.getByLabel('Customer email').pressSequentially(email, { delay: 20 });
  await page.getByLabel('Product 1').pressSequentially('Sukkari Dates Gift Box', { delay: 20 });
  await page.getByLabel('Quantity 1').fill('2');
  await page.getByLabel('Unit price 1').pressSequentially('95', { delay: 60 });
  if (secondItem) {
    await page.getByRole('button', { name: '+ Add item' }).click();
    await page.getByLabel('Product 2').pressSequentially('Arabic Coffee Dallah', { delay: 20 });
    await page.getByLabel('Unit price 2').pressSequentially('120', { delay: 60 });
  }
}

// ── Sign in ───────────────────────────────────────────────────────────────
await page.goto(`${BASE}/orders`);
await page.evaluate(() => localStorage.removeItem('orders-console:dev-flags'));
await page.reload();
await page.getByLabel('Email').waitFor();
await caption(
  'Orders Console · SARH take-home',
  'Signed-out visitors land on the login page; the session is an httpOnly cookie.',
);
await pause(2500);
await page.getByLabel('Email').pressSequentially('agent@sarh.test', { delay: 40 });
await page.getByLabel('Password').pressSequentially('Agent#2026', { delay: 40 });
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('status').filter({ hasText: 'orders' }).waitFor();

// ── R1: list ──────────────────────────────────────────────────────────────
await caption(
  'R1 · 50,000 orders, instant',
  'Keyset pages of 50 and virtualised rows: only what is on screen is in the DOM.',
);
await pause(2500);
await page.mouse.move(640, 520);
for (let i = 0; i < 8; i += 1) {
  await page.mouse.wheel(0, 1200);
  await pause(350);
}
await pause(1000);
await page
  .locator('.orders-table__scroll')
  .evaluate((el) => el.scrollTo({ top: 0, behavior: 'smooth' }));
await pause(1200);

await caption(
  'R1 · Search',
  'Name or email substring via a trigram index, Arabic included, or an order number.',
);
const search = page.getByRole('searchbox', { name: 'Search orders' });
await search.pressSequentially('harbi', { delay: 90 });
await pause(1800);
await search.fill('');
await search.pressSequentially('العتيبي', { delay: 90 });
await pause(1800);
await search.fill('');
await search.pressSequentially('#4242', { delay: 90 });
await pause(1800);
await search.fill('');
await pause(1200);

// ── R1: rapid filter test ─────────────────────────────────────────────────
await caption(
  'R1 · Rapid filter test',
  'Paid → Shipped → Cancelled in quick succession. The earlier requests are held back so their answers would arrive last.',
);
const heldMs = { paid: 2000, shipped: 1200 };
const log = [];
const onFailed = (request) => {
  const url = new URL(request.url());
  if (url.pathname !== '/api/orders') return;
  log.push(
    `status=${url.searchParams.get('status')}  → ${request.failure()?.errorText} (never rendered)`,
  );
};
const onFinished = async (request) => {
  const url = new URL(request.url());
  if (url.pathname !== '/api/orders' || !url.searchParams.get('status')) return;
  log.push(
    `status=${url.searchParams.get('status')}  → ${(await request.response())?.status()} (latest: rendered)`,
  );
};
await page.route(
  (url) => url.pathname === '/api/orders',
  async (route) => {
    const status = new URL(route.request().url()).searchParams.get('status') ?? '';
    if (heldMs[status]) await new Promise((resolve) => setTimeout(resolve, heldMs[status]));
    await route.continue().catch(() => {});
  },
);
page.on('requestfailed', onFailed);
page.on('requestfinished', onFinished);
await requestLog(['(waiting for clicks)']);
await pause(1500);
for (const status of ['Paid', 'Shipped', 'Cancelled']) {
  await page.getByRole('radio', { name: status }).click();
  await pause(250);
}
for (let i = 0; i < 6; i += 1) {
  await requestLog(log.length ? log : ['(requests in flight…)']);
  await pause(500);
}
await caption(
  'R1 · Latest filter wins',
  'Only Cancelled rows are shown. The superseded requests were aborted: net::ERR_ABORTED.',
);
await requestLog(log);
await pause(4500);
page.off('requestfailed', onFailed);
page.off('requestfinished', onFinished);
await page.unroute((url) => url.pathname === '/api/orders');
await removeOverlay('demo-request-log');

// ── R2: create, double-click ──────────────────────────────────────────────
const doubleEmail = `huda.demo.${Date.now()}@example.com`;
await page.getByRole('link', { name: 'New order', exact: true }).first().click();
await caption(
  'R2 · Create order',
  'Validated by the same schema on both sides. The Idempotency-Key belongs to this draft.',
);
await fillOrder(doubleEmail, { secondItem: true });
await pause(1200);
await caption(
  'R2 · Double-click "Create order"',
  'One request, one order, whatever the agent does with the mouse.',
);
await pause(1200);
await page.getByRole('button', { name: 'Create order' }).dblclick();
await page.getByRole('heading', { name: /^Order #\d+ created$/ }).waitFor();
await pause(2200);
await page.goto(`${BASE}/orders?q=${encodeURIComponent(doubleEmail)}`);
await page.getByRole('status').filter({ hasText: 'order' }).waitFor();
await caption('R2 · Exactly one order', 'Searching the customer’s email finds a single order.');
await pause(3000);

// ── R2: lost response ─────────────────────────────────────────────────────
const lostEmail = `huda.lost.${Date.now()}@example.com`;
await page.goto(`${BASE}/orders/new`);
await page.getByLabel('Customer name').waitFor();
await caption(
  'R2 · A lost response',
  'The server creates the order but the answer never reaches the browser. The client retries with the same key.',
);
let first = true;
await page.route(
  (url) => url.pathname === '/api/orders',
  async (route) => {
    if (route.request().method() !== 'POST' || !first) return route.fallback();
    first = false;
    await route.fetch();
    await route.abort('connectionreset');
  },
);
await fillOrder(lostEmail);
await pause(800);
await page.getByRole('button', { name: 'Create order' }).click();
await page.getByRole('heading', { name: /^Order #\d+ created$/ }).waitFor({ timeout: 15_000 });
await caption(
  'R2 · Replayed, not duplicated',
  'The retry returned the order the first attempt created (Idempotent-Replayed: true).',
);
await pause(4000);
await page.unrouteAll({ behavior: 'ignoreErrors' });

// ── R2: the proof script ──────────────────────────────────────────────────
const proof = execFileSync('npm', ['run', '--silent', 'proof:duplicates'], {
  encoding: 'utf8',
  cwd: REPO,
});
await page.setContent(`<!doctype html><meta charset="utf-8">
  <body style="margin:0;padding:28px;background:#eef0f5;font-family:system-ui">
    <div style="width:1180px;border-radius:12px;overflow:hidden;box-shadow:0 12px 32px rgb(0 0 0/25%)">
      <div style="background:#2b3242;color:#c5cad6;font-size:12px;padding:8px 14px">npm run proof:duplicates</div>
      <pre id="out" style="margin:0;padding:18px;background:#141925;color:#e8ebf2;font:13px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap"></pre>
    </div>
  </body>`);
await page
  .locator('#out')
  .evaluate(
    (el, text) => (el.textContent = `$ npm run proof:duplicates\n${text.trimEnd()}`),
    proof,
  );
await caption(
  'R2 · The proof',
  'Two API processes, one database, identical requests in parallel: one order per key, counted in the database file.',
);
await pause(9000);

// ── O1: slow stats ────────────────────────────────────────────────────────
await page.goto(`${BASE}/stats`);
await page.getByText(/Loading stats…/).waitFor();
await caption(
  'O1 · Slow stats (3–6 s)',
  'The page renders at once with a timer, and the rest of the app stays usable.',
);
await pause(1800);
await caption(
  'O1 · Leaving cancels the request',
  'Navigating away aborts it in the browser; the server skips the report.',
);
await page.getByRole('link', { name: 'Orders', exact: true }).click();
await pause(1800);
await page.getByRole('link', { name: 'Overview' }).click();
await caption('O1 · Back on Overview', 'A fresh request; this time we wait for it.');
await page.getByText('Revenue today').waitFor({ timeout: 15_000 });
await pause(2500);
await caption('O1 · When the report fails', 'DEV switch: make stats requests fail. Then Refresh.');
await page.getByLabel('Make stats requests fail').check();
await pause(800);
await page.getByRole('button', { name: 'Refresh' }).click();
await page.getByRole('alert').waitFor({ timeout: 15_000 });
await caption(
  'O1 · Visible error, one Retry',
  'The last numbers stay on screen. Switch the failure off and retry once.',
);
await pause(2500);
await page.getByLabel('Make stats requests fail').uncheck();
await page.getByRole('button', { name: 'Retry' }).click();
await page.getByText(/^Updated /).waitFor({ timeout: 15_000 });
await pause(1500);

// ── End ───────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/orders`);
await page.getByRole('status').filter({ hasText: 'orders' }).waitFor();
await caption(
  'Evidence in the repo',
  '226 tests · 18 Playwright journeys · mutation checks · benchmark. See README, DECISIONS.md, SCALE.md.',
);
await pause(4000);

const video = page.video();
await context.close();
await browser.close();
const target = path.join(OUT_DIR, 'orders-console-demo.webm');
renameSync(await video.path(), target);
rmSync(TMP, { recursive: true, force: true });
console.log(`saved ${target}`);
