// SEC-1 … SEC-11: one test (at least) per problem found in the inherited auth code.
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SESSION_AUDIENCE, SESSION_ISSUER, signSessionToken } from '../src/auth/session-token';
import {
  ADMIN,
  AGENT,
  APP_ORIGIN,
  TEST_SECRET,
  createTestContext,
  signIn,
  type TestContext,
} from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext({ orders: 20 });
});
afterAll(() => ctx.close());

const agentId = () =>
  (ctx.db.prepare('SELECT id FROM users WHERE email = ?').get(AGENT.email) as { id: number }).id;
const withSession = (token: string) => `session=${token}`;

describe('POST /api/auth/login', () => {
  it('sets an httpOnly, SameSite=Strict session cookie scoped to /api and returns no secrets', async () => {
    const response = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: AGENT.email, password: AGENT.password })
      .expect(200);

    expect(response.body).toEqual({
      user: { id: expect.any(Number), email: AGENT.email, name: AGENT.name, role: 'agent' },
    });
    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/^session=[\w-]+\.[\w-]+\.[\w-]+;/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api');
    expect(cookie).toMatch(/Max-Age=28800/);
  });

  it('accepts the email in any case and with surrounding spaces', async () => {
    await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: `  ${AGENT.email.toUpperCase()} `, password: AGENT.password })
      .expect(200);
  });

  it('answers an unknown email and a wrong password identically (no user enumeration)', async () => {
    const unknown = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'nobody@sarh.test', password: 'whatever' })
      .expect(401);
    const wrongPassword = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: ADMIN.email, password: 'not-the-password' })
      .expect(401);
    expect(unknown.body).toEqual(wrongPassword.body);
    expect(unknown.body.error.code).toBe('invalid_credentials');
  });

  it('rejects operator-injection payloads before they reach the database (400)', async () => {
    const response = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: { not: '' }, password: { not: '' } })
      .expect(400);
    expect(response.body.error.code).toBe('validation_failed');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('stores scrypt hashes, never plaintext passwords', () => {
    const rows = ctx.db.prepare('SELECT password_hash FROM users').all() as {
      password_hash: string;
    }[];
    for (const { password_hash } of rows) {
      expect(password_hash).toMatch(/^scrypt\$32768\$8\$1\$[\w+/=]+\$[\w+/=]+$/);
      expect(password_hash).not.toContain('#2026');
    }
  });

  it('rate-limits repeated failures for the same IP and email (429 on the 11th)', async () => {
    const attempt = () =>
      request(ctx.app)
        .post('/api/auth/login')
        .send({ email: 'agent2@sarh.test', password: 'nope' });
    for (let i = 0; i < 10; i += 1) await attempt().expect(401);
    const blocked = await attempt().expect(429);
    expect(blocked.body.error.code).toBe('rate_limited');
    // Other accounts from the same office IP are unaffected.
    await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: AGENT.email, password: AGENT.password })
      .expect(200);
  });
});

describe('requireAuth on /api/orders', () => {
  it('rejects requests without a session (401)', async () => {
    const response = await request(ctx.app).get('/api/orders').expect(401);
    expect(response.body.error.code).toBe('unauthenticated');
  });

  it('ignores a token passed in the query string (?token=) or an Authorization header', async () => {
    const token = signSessionToken({ userId: agentId(), tokenVersion: 0 }, TEST_SECRET);
    await request(ctx.app).get(`/api/orders?token=${token}`).expect(401);
    await request(ctx.app).get('/api/orders').set('Authorization', `Bearer ${token}`).expect(401);
    await request(ctx.app).get('/api/orders').set('Cookie', withSession(token)).expect(200);
  });

  it('rejects a token signed with another secret (the old code only decoded it)', async () => {
    const forged = jwt.sign({ ver: 0, role: 'admin' }, 'sarh-secret-2026', {
      subject: String(agentId()),
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    await request(ctx.app).get('/api/orders').set('Cookie', withSession(forged)).expect(401);
  });

  it('rejects an unsigned alg:none token claiming to be an admin', async () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
      sub: '1',
      role: 'admin',
      ver: 0,
      iss: SESSION_ISSUER,
      aud: SESSION_AUDIENCE,
    })}.`;
    await request(ctx.app).get('/api/orders').set('Cookie', withSession(unsigned)).expect(401);
  });

  it('rejects a token issued for another audience', async () => {
    const token = jwt.sign({ ver: 0 }, TEST_SECRET, {
      subject: String(agentId()),
      issuer: SESSION_ISSUER,
      audience: 'some-other-service',
    });
    await request(ctx.app).get('/api/orders').set('Cookie', withSession(token)).expect(401);
  });

  it('rejects an expired token with session_expired (sessions last 8 hours)', async () => {
    const token = signSessionToken({ userId: agentId(), tokenVersion: 0 }, TEST_SECRET);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * 60 * 60 * 1000 + 1000);
    try {
      const response = await request(ctx.app).get('/api/orders').set('Cookie', withSession(token));
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('session_expired');
    } finally {
      vi.useRealTimers();
    }
  });

  it('revokes every session on logout, including copies of the token', async () => {
    const client = await signIn(ctx.app, ADMIN);
    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: ADMIN.email, password: ADMIN.password });
    const otherDeviceCookie = login.headers['set-cookie']![0]!.split(';')[0]!;

    await client.get('/api/auth/me').expect(200);
    const logout = await client.post('/api/auth/logout').expect(204);
    expect(logout.headers['set-cookie']?.[0]).toMatch(/^session=;/);

    await request(ctx.app).get('/api/auth/me').set('Cookie', otherDeviceCookie).expect(401);
  });

  it('reads the role from the database on every request, so a demotion is immediate', async () => {
    const client = await signIn(ctx.app, ADMIN);
    expect((await client.get('/api/auth/me').expect(200)).body.user.role).toBe('admin');

    ctx.db.prepare("UPDATE users SET role = 'agent' WHERE email = ?").run(ADMIN.email);
    try {
      expect((await client.get('/api/auth/me').expect(200)).body.user.role).toBe('agent');
      await client.delete('/api/orders/1').expect(403);
    } finally {
      ctx.db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(ADMIN.email);
    }
  });
});

describe('DELETE /api/orders/:id (admin only, enforced on the server)', () => {
  it('forbids agents even though they are signed in (403)', async () => {
    const client = await signIn(ctx.app, AGENT);
    const response = await client.delete('/api/orders/2').expect(403);
    expect(response.body.error.code).toBe('forbidden');
    await client.get('/api/orders/2').expect(200);
  });

  it('lets admins soft-delete: hidden from the API, kept in the database with who and when', async () => {
    const client = await signIn(ctx.app, ADMIN);
    await client.delete('/api/orders/3').expect(204);
    await client.get('/api/orders/3').expect(404);
    await client.delete('/api/orders/3').expect(404);

    const row = ctx.db.prepare('SELECT deleted_at, deleted_by FROM orders WHERE id = 3').get() as {
      deleted_at: number | null;
      deleted_by: number | null;
    };
    expect(row.deleted_at).toEqual(expect.any(Number));
    expect(row.deleted_by).toEqual(expect.any(Number));
    const list = await client.get('/api/orders?limit=100').expect(200);
    expect(list.body.items.map((order: { id: number }) => order.id)).not.toContain(3);
  });

  it('answers 404 for unknown ids and 400 for malformed ones instead of crashing', async () => {
    const client = await signIn(ctx.app, ADMIN);
    await client.delete('/api/orders/999999').expect(404);
    for (const bad of ['abc', '0', '-1', '1.5', '1e3']) {
      await client.delete(`/api/orders/${bad}`).expect(400);
    }
  });
});

describe('CSRF defence for the cookie session', () => {
  it('rejects state-changing requests from a foreign Origin (403)', async () => {
    const client = await signIn(ctx.app, ADMIN);
    const response = await client
      .delete('/api/orders/4')
      .set('Origin', 'https://evil.example')
      .expect(403);
    expect(response.body.error.code).toBe('bad_origin');
    await client.get('/api/orders/4').expect(200);
  });

  it('accepts the configured app origin and clients that send no Origin', async () => {
    await request(ctx.app)
      .post('/api/auth/login')
      .set('Origin', APP_ORIGIN)
      .send({ email: AGENT.email, password: AGENT.password })
      .expect(200);
  });
});

describe('error handling', () => {
  it('answers malformed JSON with 400 and unknown API routes with 404, as JSON', async () => {
    const badJson = await request(ctx.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(badJson.body.error.code).toBe('invalid_json');
    const missing = await request(ctx.app).get('/api/nope').expect(404);
    expect(missing.body.error.code).toBe('not_found');
  });
});
