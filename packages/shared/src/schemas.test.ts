import { describe, expect, it } from 'vitest';
import { loginInputSchema } from './auth';
import {
  COUNT_CAP,
  MAX_ITEMS_PER_ORDER,
  createOrderInputSchema,
  idempotencyKeySchema,
  listOrdersQuerySchema,
  parseOrderId,
} from './orders';

const validOrder = {
  customer: { name: '  Ahmed Al-Harbi ', email: ' Ahmed@Example.COM ' },
  items: [{ productName: 'Dates Gift Box', quantity: 2, unitPriceCents: 9_500 }],
};

describe('createOrderInputSchema', () => {
  it('normalises whitespace and email case', () => {
    const parsed = createOrderInputSchema.parse(validOrder);
    expect(parsed.customer).toEqual({ name: 'Ahmed Al-Harbi', email: 'ahmed@example.com' });
  });

  it('rejects fields the client must not control (total, status)', () => {
    expect(createOrderInputSchema.safeParse({ ...validOrder, totalCents: 1 }).success).toBe(false);
    expect(createOrderInputSchema.safeParse({ ...validOrder, status: 'paid' }).success).toBe(false);
  });

  it.each([
    ['no items', { ...validOrder, items: [] }],
    ['zero quantity', { ...validOrder, items: [{ ...validOrder.items[0], quantity: 0 }] }],
    ['fractional quantity', { ...validOrder, items: [{ ...validOrder.items[0], quantity: 1.5 }] }],
    ['NaN quantity', { ...validOrder, items: [{ ...validOrder.items[0], quantity: Number.NaN }] }],
    ['zero price', { ...validOrder, items: [{ ...validOrder.items[0], unitPriceCents: 0 }] }],
    ['float price', { ...validOrder, items: [{ ...validOrder.items[0], unitPriceCents: 12.5 }] }],
    ['bad email', { ...validOrder, customer: { name: 'Ahmed', email: 'ahmed@' } }],
    ['short name', { ...validOrder, customer: { name: 'A', email: 'a@example.com' } }],
    [
      'too many items',
      {
        ...validOrder,
        items: Array.from({ length: MAX_ITEMS_PER_ORDER + 1 }, () => validOrder.items[0]),
      },
    ],
  ])('rejects %s', (_label, input) => {
    expect(createOrderInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('listOrdersQuerySchema', () => {
  it('applies defaults and drops an empty search', () => {
    expect(listOrdersQuerySchema.parse({ q: '   ' })).toEqual({
      q: undefined,
      sort: 'createdAt',
      dir: 'desc',
      limit: 50,
    });
  });

  it('never allows more than 100 rows per page', () => {
    expect(listOrdersQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(listOrdersQuerySchema.parse({ limit: '100' }).limit).toBe(100);
  });

  it('rejects unknown statuses and repeated parameters', () => {
    expect(listOrdersQuerySchema.safeParse({ status: 'lost' }).success).toBe(false);
    expect(listOrdersQuerySchema.safeParse({ status: ['paid', 'shipped'] }).success).toBe(false);
  });

  it('exposes a bounded count cap', () => {
    expect(COUNT_CAP).toBe(10_000);
  });
});

describe('loginInputSchema', () => {
  it('rejects operator-injection payloads', () => {
    expect(loginInputSchema.safeParse({ email: { not: '' }, password: { not: '' } }).success).toBe(
      false,
    );
  });
});

describe('idempotencyKeySchema', () => {
  it('accepts a v4 UUID (what crypto.randomUUID() produces) and rejects anything else', () => {
    expect(idempotencyKeySchema.safeParse('3f1f0c1e-8a6b-4c1d-9e2f-1a2b3c4d5e6f').success).toBe(
      true,
    );
    expect(idempotencyKeySchema.safeParse('order-1').success).toBe(false);
  });
});

describe('parseOrderId', () => {
  it('accepts canonical positive integers only, like the server', () => {
    expect(parseOrderId('42')).toBe(42);
    expect(parseOrderId('999999999')).toBe(999_999_999);
    for (const raw of [undefined, '', '0', '-1', '1e3', '0x10', ' 5', '5.0', '042', '1000000000']) {
      expect(parseOrderId(raw), String(raw)).toBeNull();
    }
  });
});
