import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link, Outlet } from 'react-router';
import { formatCount, STATUS_LABELS } from '../lib/format';
import { useDebouncedValue } from '../lib/use-debounced-value';
import type { OrderFilters } from './order-filters';
import { OrdersTable } from './OrdersTable';
import { OrdersToolbar } from './OrdersToolbar';
import { useOrderFilters } from './use-order-filters';
import { useOrdersList, type OrdersListQuery } from './use-orders-list';

const SEARCH_DEBOUNCE_MS = 300;

/** What the order drawer, a child route, can tell the list underneath it. */
export interface OrdersOutletContext {
  onOrderDeleted: (orderId: number) => void;
}

export function OrdersPage() {
  const { filters, updateFilters, clearFilters } = useOrderFilters();
  // Component state, not history state: history state survives a reload and Back, which
  // would show "Order #42 was deleted." again long after the fact.
  const [flash, setFlash] = useState<string | null>(null);
  const outletContext = useMemo<OrdersOutletContext>(
    () => ({ onOrderDeleted: (orderId) => setFlash(`Order #${orderId} was deleted.`) }),
    [],
  );
  // Once the agent changes the filters, the message has served its purpose.
  const onFiltersChange = useCallback(
    (patch: Partial<OrderFilters>) => {
      setFlash(null);
      updateFilters(patch);
    },
    [updateFilters],
  );
  const onClearFilters = useCallback(() => {
    setFlash(null);
    clearFilters();
  }, [clearFilters]);
  // The search box updates the URL on every keystroke; only the settled text becomes a query.
  const settledSearch = useDebouncedValue(filters.q?.trim() ?? '', SEARCH_DEBOUNCE_MS);
  const queryFilters = useMemo<OrderFilters>(
    () => ({
      q: settledSearch || undefined,
      status: filters.status,
      sort: filters.sort,
      dir: filters.dir,
    }),
    [settledSearch, filters.status, filters.sort, filters.dir],
  );
  const list = useOrdersList(queryFilters);

  return (
    <section className="page orders-page" aria-labelledby="orders-heading">
      <div className="page-header">
        <h1 id="orders-heading">Orders</h1>
        <Link className="button button--primary" to="/orders/new">
          New order
        </Link>
      </div>
      {flash && (
        <p className="alert alert--success" role="status">
          {flash}
        </p>
      )}
      <OrdersToolbar filters={filters} onChange={onFiltersChange} />
      <ResultSummary list={list} filters={queryFilters} />
      <OrdersTable
        key={JSON.stringify(queryFilters)}
        list={list}
        filters={queryFilters}
        onClearFilters={onClearFilters}
      />
      <Outlet context={outletContext} />
    </section>
  );
}

/** Announced politely to screen readers whenever the result set changes (R1-10). */
function ResultSummary({ list, filters }: { list: OrdersListQuery; filters: OrderFilters }) {
  const total = list.data?.pages[0]?.total;
  let summary: ReactNode = null;
  if (list.isPending) {
    summary = 'Loading orders…';
  } else if (total) {
    const count = `${formatCount(total.count)}${total.capped ? '+' : ''}`;
    const noun = total.count === 1 && !total.capped ? 'order' : 'orders';
    summary = (
      <>
        {count} {noun}
        {filters.status && ` · ${STATUS_LABELS[filters.status]}`}
        {filters.q && (
          <>
            {' '}
            matching “<bdi>{filters.q}</bdi>”
          </>
        )}
      </>
    );
  }
  const refreshing = list.isFetching && !list.isPending && !list.isFetchingNextPage;
  return (
    <p className="result-summary" role="status">
      {summary}
      {refreshing && <span className="muted"> · updating…</span>}
    </p>
  );
}
