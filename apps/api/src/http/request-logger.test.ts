import { describe, expect, it } from 'vitest';
import { redactUrl } from './request-logger';

describe('redactUrl', () => {
  it('removes search terms (customer PII) and shortens cursors, keeping the useful filters', () => {
    expect(redactUrl('/api/orders?q=huda.q%40example.com&status=paid&cursor=WyJ0b3RhbCJd')).toBe(
      '/api/orders?q=<redacted>&status=paid&cursor=…',
    );
  });

  it('leaves URLs without a query untouched', () => {
    expect(redactUrl('/api/orders/42')).toBe('/api/orders/42');
  });

  it('keeps control characters encoded, so a request cannot forge log lines', () => {
    const forged = redactUrl(
      '/api/orders?status=x%0D%0A2026-10-21T00:00:00.000Z%20INFO%20%20DELETE%20%2Fapi%2Forders%2F7%20204%E2%80%A8',
    );
    expect(forged).not.toMatch(/[\p{Cc}\p{Zl}\p{Zp}]/u);
    expect(forged).toBe(
      '/api/orders?status=x%0D%0A2026-10-21T00:00:00.000Z+INFO++DELETE+/api/orders/7+204%E2%80%A8',
    );
  });
});
