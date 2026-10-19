import type { OrderSummary, SortField } from '@orders/shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { errorMessage } from '../lib/api-client';
import { formatDateTime, formatMoney } from '../lib/format';
import { hasActiveFilters, type OrderFilters } from './order-filters';
import { StatusBadge } from './StatusBadge';
import type { OrdersListQuery } from './use-orders-list';

const ROW_HEIGHT = 56;
const HEADER_HEIGHT = 44;
/** Fetch the next page while this many loaded rows are still below the viewport. */
const PREFETCH_ROWS = 15;
const SKELETON_ROWS = 10;

interface OrdersTableProps {
  list: OrdersListQuery;
  filters: OrderFilters;
  onClearFilters: () => void;
}

/**
 * Virtualised: only the rows in view (plus overscan) are in the DOM, however many pages have
 * been loaded (R1-6). Re-mounted by the parent whenever the filters change, which resets the
 * scroll position for the new result set.
 */
export function OrdersTable({ list, filters, onClearFilters }: OrdersTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { search } = useLocation();
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = list;
  const orders = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const total = data?.pages[0]?.total;
  const showLoaderRow = hasNextPage || isFetchNextPageError;

  // eslint-disable-next-line react-hooks/incompatible-library -- the virtualizer is a mutable instance by design; this component is not compiled by React Compiler
  const virtualizer = useVirtualizer({
    count: orders.length + (showLoaderRow ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin: HEADER_HEIGHT, // the sticky header sits above the rows inside the scroller
  });
  const virtualRows = virtualizer.getVirtualItems();
  const lastRenderedIndex = virtualRows.at(-1)?.index ?? -1;

  useEffect(() => {
    const nearTheEnd = lastRenderedIndex >= orders.length - PREFETCH_ROWS;
    if (nearTheEnd && hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
      void fetchNextPage();
    }
  }, [
    lastRenderedIndex,
    orders.length,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  ]);

  let body;
  if (isPending) {
    body = <SkeletonRows />;
  } else if (isError && !data) {
    body = (
      <div className="table-message" role="alert">
        <p>Couldn’t load orders. {errorMessage(error)}</p>
        <button type="button" className="button" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );
  } else if (orders.length === 0) {
    body = (
      <div className="table-message">
        <p>No orders match these filters.</p>
        {hasActiveFilters(filters) && (
          <button type="button" className="button" onClick={onClearFilters}>
            Clear filters
          </button>
        )}
      </div>
    );
  } else {
    body = (
      <div
        role="rowgroup"
        className="orders-table__body"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualRows.map((virtualRow) => {
          const top = virtualRow.start - HEADER_HEIGHT;
          const order = orders[virtualRow.index];
          return order ? (
            <OrderRow
              key={order.id}
              order={order}
              index={virtualRow.index}
              top={top}
              search={search}
            />
          ) : (
            <LoaderRow
              key="loader"
              top={top}
              failed={isFetchNextPageError}
              onRetry={() => void fetchNextPage()}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="orders-table"
      role="table"
      aria-label="Orders"
      aria-rowcount={total && !total.capped ? total.count + 1 : -1}
      aria-busy={isPending || undefined}
    >
      <div ref={scrollRef} className="orders-table__scroll">
        <div role="rowgroup" className="orders-table__head">
          <div role="row" aria-rowindex={1} className="orders-row orders-row--head">
            <span role="columnheader">Order</span>
            <span role="columnheader">Customer</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" className="num">
              Items
            </span>
            <span role="columnheader" className="num" aria-sort={ariaSort(filters, 'total')}>
              Total
            </span>
            <span role="columnheader" aria-sort={ariaSort(filters, 'createdAt')}>
              Created
            </span>
          </div>
        </div>
        {body}
      </div>
    </div>
  );
}

interface OrderRowProps {
  order: OrderSummary;
  index: number;
  top: number;
  /** Current filters, kept in the detail link so closing the panel restores the same view. */
  search: string;
}

const OrderRow = memo(function OrderRow({ order, index, top, search }: OrderRowProps) {
  const navigate = useNavigate();
  const detail = { pathname: `/orders/${order.id}`, search };
  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      className="orders-row"
      style={{ transform: `translateY(${top}px)` }}
      onClick={(event) => {
        // The order number is the real (keyboard-accessible) link; a click anywhere else on
        // the row is a mouse shortcut to the same place.
        if (!(event.target instanceof Element && event.target.closest('a'))) void navigate(detail);
      }}
    >
      <span role="cell">
        <Link to={detail} className="order-link">
          #{order.id}
        </Link>
      </span>
      <span role="cell" className="customer">
        <span className="customer__name" dir="auto">
          {order.customerName}
        </span>
        <span className="customer__email">{order.customerEmail}</span>
      </span>
      <span role="cell">
        <StatusBadge status={order.status} />
      </span>
      <span role="cell" className="num">
        {order.itemCount}
      </span>
      <span role="cell" className="num">
        {formatMoney(order.totalCents)}
      </span>
      <span role="cell">
        <time dateTime={order.createdAt}>{formatDateTime(order.createdAt)}</time>
      </span>
    </div>
  );
});

function LoaderRow({
  top,
  failed,
  onRetry,
}: {
  top: number;
  failed: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      role="row"
      className="orders-row orders-row--loader"
      style={{ transform: `translateY(${top}px)` }}
    >
      <span role="cell">
        {failed ? (
          <>
            Couldn’t load more orders.{' '}
            <button type="button" className="link-button" onClick={onRetry}>
              Retry
            </button>
          </>
        ) : (
          'Loading more orders…'
        )}
      </span>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="orders-table__skeleton" aria-hidden="true">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div key={index} className="orders-row orders-row--skeleton">
          <span className="skeleton" />
          <span className="skeleton skeleton--wide" />
          <span className="skeleton" />
          <span className="skeleton skeleton--short" />
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      ))}
    </div>
  );
}

function ariaSort(
  filters: OrderFilters,
  column: SortField,
): 'ascending' | 'descending' | undefined {
  if (filters.sort !== column) return undefined;
  return filters.dir === 'asc' ? 'ascending' : 'descending';
}
