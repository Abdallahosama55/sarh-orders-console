import { useQuery } from '@tanstack/react-query';
import { getOrderStats } from '../orders/orders-api';
import { orderKeys } from '../orders/query-keys';

/**
 * O1. The query function hands React Query's signal to fetch, so when the page unmounts
 * (the agent navigates away) the in-flight 3–6 s request is aborted, and the server stops too.
 * `retry: false`: no silent automatic retries that would double the wait; the error state
 * offers one explicit Retry instead (assumption A-6).
 */
export function useOrderStats() {
  return useQuery({
    queryKey: orderKeys.stats(),
    queryFn: ({ signal }) => getOrderStats(signal),
    retry: false,
    staleTime: 60_000,
  });
}
