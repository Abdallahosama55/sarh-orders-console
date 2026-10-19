import { describe, expect, it } from 'vitest';
import { safeNextPath } from './session';

describe('safeNextPath', () => {
  it.each([
    ['/orders?status=paid', '/orders?status=paid'],
    ['/stats', '/stats'],
  ])('keeps the in-app path %s', (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });

  it.each([null, '', 'https://evil.example', '//evil.example/orders', '/\\evil.example', 'orders'])(
    'refuses %j and falls back to /orders (no open redirect)',
    (next) => {
      expect(safeNextPath(next)).toBe('/orders');
    },
  );
});
