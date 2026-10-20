import { describe, expect, it } from 'vitest';
import { safeNextPath } from './session';

describe('safeNextPath', () => {
  it.each([
    ['/orders?status=paid', '/orders?status=paid'],
    ['/stats', '/stats'],
    ['/orders/42?q=a#details', '/orders/42?q=a#details'],
  ])('keeps the in-app path %s', (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });

  it.each([
    null,
    '',
    'https://evil.example',
    '//evil.example/orders',
    '/\\evil.example',
    'orders',
    // The URL parser drops tabs and newlines, so these become //evil.example in the browser.
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r\n/evil.example',
  ])('refuses %j and falls back to /orders (no open redirect)', (next) => {
    expect(safeNextPath(next)).toBe('/orders');
  });
});
