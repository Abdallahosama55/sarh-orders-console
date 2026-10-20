// The Vercel demo entry point: seeds its own database on cold start and serves the real app.
import type { ApiErrorBody, ListOrdersResponse } from '@orders/shared';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Seed from '../src/db/seed';
import type * as VercelHandler from '../src/vercel-handler';
import { AGENT, TEST_SECRET } from './helpers';

const directory = mkdtempSync(path.join(os.tmpdir(), 'orders-vercel-test-'));
const DEPLOYMENT = 'orders-demo-abc123.vercel.app';
let handler: typeof VercelHandler.default;

beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: 'production',
    JWT_SECRET: TEST_SECRET,
    DATABASE_PATH: path.join(directory, 'orders.db'),
    SEED_ORDERS: '120',
    LOG_LEVEL: 'silent',
    VERCEL_URL: DEPLOYMENT,
  });
  delete process.env.APP_ORIGIN;
  ({ default: handler } = await import('../src/vercel-handler'));
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('Vercel handler', () => {
  it('seeds a fresh database on the first request and serves the API', async () => {
    await request(handler).get('/api/health').expect(200, { ok: true });
    const login = await request(handler)
      .post('/api/auth/login')
      .set('Origin', `https://${DEPLOYMENT}`)
      .send({ email: AGENT.email, password: AGENT.password })
      .expect(200);
    const cookie = login.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('Secure'); // production cookie: browsers send it over https only
    // supertest talks plain http and so drops Secure cookies; send it as an https client would.
    const list = (
      await request(handler).get('/api/orders').set('Cookie', cookie.split(';')[0]!).expect(200)
    ).body as ListOrdersResponse;
    expect(list.total).toEqual({ count: 120, capped: false });
  });

  it("accepts the deployment's own origin and rejects others (CSRF check)", async () => {
    await request(handler)
      .post('/api/auth/logout')
      .set('Origin', 'https://evil.example')
      .expect(403);
    await request(handler)
      .post('/api/auth/logout')
      .set('Origin', `https://${DEPLOYMENT}`)
      .expect(204);
  });

  it('retries a failed cold start on the next request, and never serves a half-seeded database', async () => {
    const databasePath = path.join(directory, 'cold-start', 'orders.db');
    process.env.DATABASE_PATH = databasePath;
    // The first seed dies halfway (say /tmp fills up): the file exists, the orders do not.
    vi.doMock('../src/db/seed', async (importOriginal) => {
      const real = await importOriginal<typeof Seed>();
      let attempts = 0;
      return {
        ...real,
        seedDatabase: async (options: Seed.SeedOptions) => {
          if (++attempts > 1) return real.seedDatabase(options);
          await real.seedDatabase({ ...options, orderCount: 0 });
          throw new Error('ENOSPC: no space left on device');
        },
      };
    });
    vi.resetModules(); // a fresh instance: nothing cached from the tests above
    const { default: coldHandler } = await import('../src/vercel-handler');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const failed = await request(coldHandler).get('/api/health').expect(503);
      expect((failed.body as ApiErrorBody).error.code).toBe('internal_error');
      expect(consoleError).toHaveBeenCalledOnce();
      expect(existsSync(databasePath)).toBe(false);

      await request(coldHandler).get('/api/health').expect(200, { ok: true });
      expect(await countOrders(coldHandler)).toBe(120);
    } finally {
      consoleError.mockRestore();
      vi.doUnmock('../src/db/seed');
    }
  });
});

async function countOrders(app: typeof handler): Promise<number | undefined> {
  const login = await request(app)
    .post('/api/auth/login')
    .set('Origin', `https://${DEPLOYMENT}`)
    .send({ email: AGENT.email, password: AGENT.password })
    .expect(200);
  const cookie = (login.headers['set-cookie']?.[0] ?? '').split(';')[0]!;
  const list = await request(app).get('/api/orders').set('Cookie', cookie).expect(200);
  return (list.body as ListOrdersResponse).total?.count;
}
