import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { parseOrderFilters, serializeOrderFilters, type OrderFilters } from './order-filters';

export function useOrderFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseOrderFilters(searchParams), [searchParams]);

  const updateFilters = useCallback(
    (patch: Partial<OrderFilters>) => {
      setSearchParams(
        (current) => serializeOrderFilters({ ...parseOrderFilters(current), ...patch }),
        {
          replace: true,
        },
      );
    },
    [setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams(
      (current) => {
        const { sort, dir } = parseOrderFilters(current);
        return serializeOrderFilters({ sort, dir });
      },
      { replace: true },
    );
  }, [setSearchParams]);

  return { filters, updateFilters, clearFilters };
}
