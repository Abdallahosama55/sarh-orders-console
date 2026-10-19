// O1: slow stats endpoint, its numbers, and server-side cancellation.
import { DEBUG_FAIL_HEADER, type OrderStats } from '@orders/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOrdersRepository } from '../src/orders/orders.repository';
import { buildOrderStats } from '../src/orders/stats';
import {
  AGENT,
  createTestContext,
  listen,
  recordingLogger,
  sessionCookieFor,
  signIn,
  type TestContext,
} from './helpers';

describe('buildOrderStats', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext({ orders: 0 });
    const insert = ctx.db.prepare(
      "INSERT INTO orders (customer_name, customer_email, status, total_cents, created_at) VALUES ('Test', 't@example.com', ?, ?, ?)",
    );
    // Riyadh is UTC+3, so its 19 Oct starts at 2026-10-18T21:00:00Z.
    insert.run('paid', 1_000, Date.parse('2026-10-18T20:59:59.999Z')); // yesterday in Riyadh
    insert.run('paid', 2_000, Date.parse('2026-10-18T21:00:00.000Z')); // first instant of today
    insert.run('shipped', 4_000, Date.parse('2026-10-19T08:00:00.000Z'));
    insert.run('delivered', 8_000, Date.parse('2026-10-19T08:30:00.000Z'));
    insert.run('pending', 16_000, Date.parse('2026-10-19T08:45:00.000Z')); // not revenue (A-5)
    insert.run('cancelled', 32_000, Date.parse('2026-10-19T08:50:00.000Z')); // not revenue
  });
  afterAll(() => ctx.close());

  it('totals every status and counts only paid/shipped/delivered orders since local midnight', () => {
    const stats = buildOrderStats(
      createOrdersRepository(ctx.db),
      'Asia/Riyadh',
      new Date('2026-10-19T09:00:00.000Z'),
    );
    expect(stats.byStatus).toEqual([
      { status: 'pending', count: 1, totalCents: 16_000 },
      { status: 'paid', count: 2, totalCents: 3_000 },
      { status: 'shipped', count: 1, totalCents: 4_000 },
      { status: 'delivered', count: 1, totalCents: 8_000 },
      { status: 'cancelled', count: 1, totalCents: 32_000 },
    ]);
    expect(stats.revenueToday).toEqual({
      totalCents: 2_000 + 4_000 + 8_000,
      orderCount: 3,
      since: '2026-10-18T21:00:00.000Z',
      timeZone: 'Asia/Riyadh',
    });
  });
});

describe('GET /api/orders/stats', () => {
  it('requires a session', async () => {
    const ctx = await createTestContext();
    try {
      await request(ctx.app).get('/api/orders/stats').expect(401);
    } finally {
      ctx.close();
    }
  });

  it('answers only after the configured delay', async () => {
    const ctx = await createTestContext({
      orders: 30,
      config: { statsDelayMs: { min: 300, max: 300 } },
    });
    try {
      const client = await signIn(ctx.app, AGENT);
      const startedAt = performance.now();
      const body = (await client.get('/api/orders/stats').expect(200)).body as OrderStats;
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(290);
      expect(body.byStatus.reduce((sum, row) => sum + row.count, 0)).toBe(30);
    } finally {
      ctx.close();
    }
  });

  it('stops working when the client leaves: the report queries never run (O1-3)', async () => {
    const logger = recordingLogger();
    const ctx = await createTestContext({
      config: { statsDelayMs: { min: 400, max: 400 } },
      logger,
    });
    const server = await listen(ctx.app);
    try {
      const cookie = await sessionCookieFor(server.baseUrl, AGENT);
      const controller = new AbortController();
      const pending = fetch(`${server.baseUrl}/api/orders/stats`, {
        headers: { cookie },
        signal: controller.signal,
      });
      setTimeout(() => controller.abort(), 100);
      await expect(pending).rejects.toThrow(/abort/i);

      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(
        logger.lines.some((line) => line.startsWith('stats report skipped: client left after')),
      ).toBe(true);
      expect(
        logger.lines.some((line) => /GET \/api\/orders\/stats aborted by client/.test(line)),
      ).toBe(true);
    } finally {
      await server.close();
      ctx.close();
    }
  });

  it('fails on demand in development (X-Debug-Fail) but ignores the header in production', async () => {
    const dev = await createTestContext();
    const prod = await createTestContext({
      config: { nodeEnv: 'production', devSimulation: false },
    });
    try {
      const devClient = await signIn(dev.app, AGENT);
      const failed = await devClient
        .get('/api/orders/stats')
        .set(DEBUG_FAIL_HEADER, '1')
        .expect(503);
      expect(failed.body.error.code).toBe('simulated_failure');
      expect(failed.headers['retry-after']).toBe('1');

      const prodClient = await signIn(prod.app, AGENT);
      await prodClient.get('/api/orders/stats').set(DEBUG_FAIL_HEADER, '1').expect(200);
    } finally {
      dev.close();
      prod.close();
    }
  });
});
