import { afterEach, describe, expect, it, vi } from 'vitest';
import { newIdempotencyKey, readDraft } from './order-draft';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('newIdempotencyKey', () => {
  it('returns a v4 UUID', () => {
    expect(newIdempotencyKey()).toMatch(UUID_V4);
  });

  it('still returns a v4 UUID where crypto.randomUUID is unavailable (plain http on a LAN IP)', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const keys = new Set(Array.from({ length: 50 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(50);
    for (const key of keys) expect(key).toMatch(UUID_V4);
  });
});

describe('readDraft', () => {
  it('ignores corrupt or foreign data instead of crashing the form', () => {
    window.sessionStorage.setItem('orders-console:create-order-draft', '{not json');
    expect(readDraft()).toBeNull();
    window.sessionStorage.setItem(
      'orders-console:create-order-draft',
      JSON.stringify({ idempotencyKey: 'x' }),
    );
    expect(readDraft()).toBeNull();
  });

  it('restores a stored draft, turning an emptied quantity back into 1', () => {
    const idempotencyKey = '3f1f0c1e-8a6b-4c1d-9e2f-1a2b3c4d5e6f';
    window.sessionStorage.setItem(
      'orders-console:create-order-draft',
      JSON.stringify({
        idempotencyKey,
        values: {
          customerName: 'Huda',
          customerEmail: '',
          items: [{ productName: 'Tea', quantity: null, unitPrice: '1' }],
        },
      }),
    );
    expect(readDraft()).toEqual({
      idempotencyKey,
      values: {
        customerName: 'Huda',
        customerEmail: '',
        items: [{ productName: 'Tea', quantity: 1, unitPrice: '1' }],
      },
    });
  });
});
