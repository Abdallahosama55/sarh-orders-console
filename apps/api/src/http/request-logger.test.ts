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
});
