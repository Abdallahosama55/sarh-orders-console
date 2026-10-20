import type { OrderFilters } from './order-filters';

/**
 * Every server result is cached under the key of the request that produced it. The list
 * renders the entry for the *current* filters, so a late response for old filters can only
 * update an entry nobody is looking at. That is the latest-wins guarantee (R1-8).
 */
export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (filters: OrderFilters) => [...orderKeys.lists(), filters] as const,
  /** `null`: the URL holds no valid order id, and the query is skipped. */
  detail: (id: number | null) => [...orderKeys.all, 'detail', id] as const,
  stats: () => [...orderKeys.all, 'stats'] as const,
};
