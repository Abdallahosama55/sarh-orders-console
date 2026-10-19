import { describe, expect, it } from 'vitest';
import { parseOrderFilters, serializeOrderFilters } from './order-filters';

describe('order filters ⇄ URL', () => {
  it('defaults to newest first with no filters', () => {
    expect(parseOrderFilters(new URLSearchParams())).toEqual({
      q: undefined,
      status: undefined,
      sort: 'createdAt',
      dir: 'desc',
    });
  });

  it('falls back to defaults for values a hand-edited URL might contain', () => {
    expect(parseOrderFilters(new URLSearchParams('status=lost&sort=name&dir=sideways'))).toEqual({
      q: undefined,
      status: undefined,
      sort: 'createdAt',
      dir: 'desc',
    });
  });

  it('round-trips and omits defaults so the plain list keeps a clean URL', () => {
    const filters = {
      q: 'huda',
      status: 'paid' as const,
      sort: 'total' as const,
      dir: 'asc' as const,
    };
    const params = serializeOrderFilters(filters);
    expect(params.toString()).toBe('q=huda&status=paid&sort=total&dir=asc');
    expect(parseOrderFilters(params)).toEqual(filters);
    expect(serializeOrderFilters({ sort: 'createdAt', dir: 'desc' }).toString()).toBe('');
  });
});
