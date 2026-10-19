import { useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { formatCount, STATUS_LABELS } from '../lib/format';
import { useDebouncedValue } from '../lib/use-debounced-value';
import type { OrderFilters } from './order-filters';
import { OrdersTable } from './OrdersTable';
import { OrdersToolbar } from './OrdersToolbar';
import { useOrderFilters } from './use-order-filters';
import { useOrdersList, type OrdersListQuery } from './use-orders-list';

const SEARCH_DEBOUNCE_MS = 300;

export function OrdersPage() {
  const { filters, updateFilters, clearFilters } = useOrderFilters();
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
      <FlashMessage />
      <OrdersToolbar filters={filters} onChange={updateFilters} />
      <ResultSummary list={list} filters={queryFilters} />
      <OrdersTable
        key={JSON.stringify(queryFilters)}
        list={list}
        filters={queryFilters}
        onClearFilters={clearFilters}
      />
      <Outlet />
    </section>
  );
}

/** Announced politely to screen readers whenever the result set changes (R1-10). */
function ResultSummary({ list, filters }: { list: OrdersListQuery; filters: OrderFilters }) {
  const total = list.data?.pages[0]?.total;
  let text = '';
  if (list.isPending) {
    text = 'Loading orders…';
  } else if (total) {
    const count = `${formatCount(total.count)}${total.capped ? '+' : ''}`;
    const noun = total.count === 1 && !total.capped ? 'order' : 'orders';
    const status = filters.status ? ` · ${STATUS_LABELS[filters.status]}` : '';
    const search = filters.q ? ` matching “${filters.q}”` : '';
    text = `${count} ${noun}${status}${search}`;
  }
  const refreshing = list.isFetching && !list.isPending && !list.isFetchingNextPage;
  return (
    <p className="result-summary" role="status">
      {text}
      {refreshing && <span className="muted"> · updating…</span>}
    </p>
  );
}

function FlashMessage() {
  const state: unknown = useLocation().state;
  const message =
    typeof state === 'object' &&
    state !== null &&
    'flash' in state &&
    typeof state.flash === 'string'
      ? state.flash
      : null;
  if (!message) return null;
  return (
    <p className="alert alert--success" role="status">
      {message}
    </p>
  );
}
