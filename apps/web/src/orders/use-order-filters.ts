import { useCallback, useMemo } from 'react';
import { useSearchParams, type NavigateOptions } from 'react-router';
import { parseOrderFilters, serializeOrderFilters, type OrderFilters } from './order-filters';

// The toolbar's inputs are controlled by the URL. React Router applies navigations as a
// transition by default, and until it commits React snaps a controlled input back to its
// previous value, so a fast typist could lose characters and a radio would flicker back.
// Filter edits are direct user input, so they are committed synchronously.
const FILTER_NAVIGATION: NavigateOptions = { replace: true, flushSync: true };

export function useOrderFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseOrderFilters(searchParams), [searchParams]);

  const updateFilters = useCallback(
    (patch: Partial<OrderFilters>) => {
      setSearchParams(
        (current) => serializeOrderFilters({ ...parseOrderFilters(current), ...patch }),
        FILTER_NAVIGATION,
      );
    },
    [setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams((current) => {
      const { sort, dir } = parseOrderFilters(current);
      return serializeOrderFilters({ sort, dir });
    }, FILTER_NAVIGATION);
  }, [setSearchParams]);

  return { filters, updateFilters, clearFilters };
}
