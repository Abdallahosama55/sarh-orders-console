// The Vercel demo entry point: seeds its own database on cold start and serves the real app.
import type { ListOrdersResponse } from '@orders/shared';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
});
