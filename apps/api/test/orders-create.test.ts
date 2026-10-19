// R2: an order is created at most once per (user, Idempotency-Key), however the request is repeated.
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  type CreateOrderInput,
  type ListOrdersResponse,
  type OrderDetail,
} from '@orders/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ADMIN,
  AGENT,
  SECOND_AGENT,
  createTestContext,
  listen,
  sessionCookieFor,
  signIn,
  type TestContext,
} from './helpers';

let ctx: TestContext;
let agent: Awaited<ReturnType<typeof signIn>>;

beforeAll(async () => {
  ctx = await createTestContext({ orders: 10 });
  agent = await signIn(ctx.app, AGENT);
});
afterAll(() => ctx.close());

const order = (overrides: Partial<CreateOrderInput> = {}): CreateOrderInput => ({
  customer: { name: 'Huda Al-Qahtani', email: 'huda.q@example.com' },
  items: [
    { productName: 'Sukkari Dates Gift Box', quantity: 2, unitPriceCents: 9_500 },
    { productName: 'Arabic Coffee Dallah', quantity: 1, unitPriceCents: 12_000 },
  ],
  ...overrides,
});

const ordersWithKey = (key: string) =>
  (
    ctx.db.prepare('SELECT COUNT(*) AS n FROM orders WHERE idempotency_key = ?').get(key) as {
      n: number;
    }
  ).n;
const orderCount = () =>
  (ctx.db.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }).n;

describe('POST /api/orders', () => {
  it('creates a pending order whose total is computed by the server', async () => {
    const key = randomUUID();
    const response = await agent
      .post('/api/orders')
      .set(IDEMPOTENCY_KEY_HEADER, key)
      .send(order())
      .expect(201);
    const created = response.body as OrderDetail;

    expect(created).toMatchObject({
      customerName: 'Huda Al-Qahtani',
      customerEmail: 'huda.q@example.com',
      status: 'pending',
      totalCents: 2 * 9_500 + 12_000,
      createdBy: { name: AGENT.name },
    });
    expect(created.items.map((item) => item.lineTotalCents)).toEqual([19_000, 12_000]);
    expect(response.headers.location).toBe(`/api/orders/${created.id}`);
    expect(response.headers[IDEMPOTENT_REPLAYED_HEADER.toLowerCase()]).toBeUndefined();
  });

  it('makes the new order searchable immediately (trigram index kept in sync by triggers)', async () => {
    const created = (
      await agent
        .post('/api/orders')
        .set(IDEMPOTENCY_KEY_HEADER, randomUUID())
        .send(order({ customer: { name: 'Zainab Searchable', email: 'zainab.s@example.com' } }))
        .expect(201)
    ).body as OrderDetail;
    const list = (await agent.get('/api/orders?q=searchable').expect(200))
      .body as ListOrdersResponse;
    expect(list.items.map((item) => item.id)).toEqual([created.id]);
  });

  it('requires an Idempotency-Key, and it must be a UUID', async () => {
    const missing = await agent.post('/api/orders').send(order()).expect(400);
    expect(missing.body.error.code).toBe('idempotency_key_missing');
    const malformed = await agent
      .post('/api/orders')
      .set(IDEMPOTENCY_KEY_HEADER, 'order-1')
      .send(order())
      .expect(400);
    expect(malformed.body.error.code).toBe('validation_failed');
  });

  it('rejects invalid input with per-field messages, without consuming the key', async () => {
    const key = randomUUID();
    const invalid = await agent
      .post('/api/orders')
      .set(IDEMPOTENCY_KEY_HEADER, key)
      .send(order({ items: [{ productName: '', quantity: 0, unitPriceCents: 9_500 }] }))
      .expect(400);
    expect(invalid.body.error.details.fields).toMatchObject({
      'items.0.productName': expect.any(String),
      'items.0.quantity': 'At least 1',
    });
    expect(ordersWithKey(key)).toBe(0);

    // The agent fixes the form and resubmits the same draft: the key is still usable.
    await agent.post('/api/orders').set(IDEMPOTENCY_KEY_HEADER, key).send(order()).expect(201);
    expect(ordersWithKey(key)).toBe(1);
  });

  it('refuses client-controlled totals or status (strict contract)', async () => {
    const response = await agent
      .post('/api/orders')
      .set(IDEMPOTENCY_KEY_HEADER, randomUUID())
      .send({ ...order(), totalCents: 1, status: 'delivered' })
      .expect(400);
    expect(response.body.error.code).toBe('validation_failed');
  });
});

describe('idempotency (R2-4 … R2-7)', () => {
  it('replays a repeated request: same order, Idempotent-Replayed header, still one row', async () => {
    const key = randomUUID();
    const first = await agent
      .post('/api/orders')
      .set(IDEMPOTENCY_KEY_HEADER, key)
      .send(order())
      .expect(201);
    const second = await agent
      .post('/api/orders')
      .set(IDEMPOTENCY_KEY_HEADER, key)
      .send(order())
      .expect(201);

    expect(second.body).toEqual(first.body);
    expect(second.headers[IDEMPOTENT_REPLAYED_HEADER.toLowerCase()]).toBe('true');
    expect(ordersWithKey(key)).toBe(1);
  });

  it('treats whitespace and email case as the same request (fingerprint of the validated body)', async () => {
    const key = randomUUID();
    await agent.post('/api/orders').set(IDEMPOTENCY_KEY_HEADER, key).send(order()).expect(201);
    const noisy = order({ customer: { name: '  Huda Al-Qahtani ', email: 'HUDA.Q@example.com' } });
    const replay = await agent
      .post('/api/orders')
      .set(IDEMPOTENCY_KEY_HEADER, key)
      .send(noisy)
      .expect(201);
    expect(replay.headers[IDEMPOTENT_REPLAYED_HEADER.toLowerCase()]).toBe('true');
    expect(ordersWithKey(key)).toBe(1);
  });

  it('treats an upper-case key as the same UUID', async () => {
    const key = randomUUID();
    await agent.post('/api/orders').set(IDEMPOTENCY_KEY_HEADER, key).send(order()).expect(201);
    const replay = await agent
      .post('/api/orders')
      .set(IDEMPOTENCY_KEY_HEADER, key.toUpperCase())
      .send(order())
      .expect(201);
    expect(replay.headers[IDEMPOTENT_REPLAYED_HEADER.toLowerCase()]).toBe('true');
  });

  it('rejects the same key with a different body (422) and creates nothing', async () => {
    const key = randomUUID();
    const original = (
      await agent.post('/api/orders').set(IDEMPOTENCY_KEY_HEADER, key).send(order()).expect(201)
    ).body as OrderDetail;
    const before = orderCount();

    const edited = order({
      items: [{ productName: 'Tea Set', quantity: 3, unitPriceCents: 15_500 }],
    });
    const response = await agent
      .post('/api/orders')
      .set(IDEMPOTENCY_KEY_HEADER, key)
      .send(edited)
      .expect(422);

    expect(response.body.error).toMatchObject({
      code: 'idempotency_key_reused',
      details: { orderId: original.id },
    });
    expect(orderCount()).toBe(before);
  });

  it('scopes keys per user: the same key from two agents creates two orders', async () => {
    const key = randomUUID();
    const second = await signIn(ctx.app, SECOND_AGENT);
    const a = (
      await agent.post('/api/orders').set(IDEMPOTENCY_KEY_HEADER, key).send(order()).expect(201)
    ).body;
    const b = (
      await second.post('/api/orders').set(IDEMPOTENCY_KEY_HEADER, key).send(order()).expect(201)
    ).body;
    expect(a.id).not.toBe(b.id);
    expect(ordersWithKey(key)).toBe(2);
  });

  it('never re-creates an order an admin deleted: a late retry gets 409', async () => {
    const key = randomUUID();
    const created = (
      await agent.post('/api/orders').set(IDEMPOTENCY_KEY_HEADER, key).send(order()).expect(201)
    ).body as OrderDetail;
    const admin = await signIn(ctx.app, ADMIN);
    await admin.delete(`/api/orders/${created.id}`).expect(204);

    const retry = await agent
      .post('/api/orders')
      .set(IDEMPOTENCY_KEY_HEADER, key)
      .send(order())
      .expect(409);
    expect(retry.body.error).toMatchObject({
      code: 'order_deleted',
      details: { orderId: created.id },
    });
    expect(ordersWithKey(key)).toBe(1);
  });
});

describe('R2-9 proof: identical requests fired in parallel', () => {
  async function fireInParallel(times: number) {
    const server = await listen(ctx.app);
    try {
      const cookie = await sessionCookieFor(server.baseUrl, AGENT);
      const key = randomUUID();
      const before = orderCount();
      const responses = await Promise.all(
        Array.from({ length: times }, () =>
          fetch(`${server.baseUrl}/api/orders`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie, [IDEMPOTENCY_KEY_HEADER]: key },
            body: JSON.stringify(order()),
          }),
        ),
      );
      const bodies = (await Promise.all(
        responses.map((response) => response.json()),
      )) as OrderDetail[];
      return {
        statuses: responses.map((response) => response.status),
        replayed: responses.filter(
          (response) => response.headers.get(IDEMPOTENT_REPLAYED_HEADER) === 'true',
        ).length,
        orderIds: new Set(bodies.map((body) => body.id)),
        rowsWithKey: ordersWithKey(key),
        newRows: orderCount() - before,
      };
    } finally {
      await server.close();
    }
  }

  it('two parallel requests → both 201, one order, the second marked as a replay', async () => {
    const result = await fireInParallel(2);
    expect(result.statuses).toEqual([201, 201]);
    expect(result.orderIds.size).toBe(1);
    expect(result.replayed).toBe(1);
    expect(result.rowsWithKey).toBe(1);
    expect(result.newRows).toBe(1);
  });

  it('twenty parallel requests → still exactly one order', async () => {
    const result = await fireInParallel(20);
    expect(result.statuses.every((status) => status === 201)).toBe(true);
    expect(result.orderIds.size).toBe(1);
    expect(result.replayed).toBe(19);
    expect(result.newRows).toBe(1);
  });
});
