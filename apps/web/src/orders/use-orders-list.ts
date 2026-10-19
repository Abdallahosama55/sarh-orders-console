import { useInfiniteQuery } from '@tanstack/react-query';
import type { OrderFilters } from './order-filters';
import { listOrders } from './orders-api';
import { orderKeys } from './query-keys';

/**
 * One cache entry per filter combination; pages are fetched with keyset cursors.
 * The `signal` is handed to fetch, so when the filters change the superseded request is
 * aborted instead of finishing in the background (R1-8).
 *
 * There is deliberately no `placeholderData: keepPreviousData`: while new filters load, the
 * table shows skeleton rows rather than rows that do not match what the agent selected.
 */
export function useOrdersList(filters: OrderFilters) {
  return useInfiniteQuery({
    queryKey: orderKeys.list(filters),
    queryFn: ({ pageParam, signal }) => listOrders({ ...filters, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export type OrdersListQuery = ReturnType<typeof useOrdersList>;
