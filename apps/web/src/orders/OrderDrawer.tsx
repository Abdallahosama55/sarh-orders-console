import { parseOrderId, type OrderDetail } from '@orders/shared';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router';
import { AdminOnly } from '../auth/AdminOnly';
import { ApiError, errorMessage } from '../lib/api-client';
import { formatDateTime, formatMoney } from '../lib/format';
import { DeleteOrderButton } from './DeleteOrderButton';
import { getOrder } from './orders-api';
import type { OrdersOutletContext } from './OrdersPage';
import { orderKeys } from './query-keys';
import { StatusBadge } from './StatusBadge';

/** Detail panel rendered over the list at /orders/:orderId, keeping the list's filters (R1-11). */
export function OrderDrawer() {
  const { orderId } = useParams();
  const id = parseOrderId(orderId); // the server's rule: "1e3" is not order 1000
  const { onOrderDeleted } = useOutletContext<OrdersOutletContext>();
  const navigate = useNavigate();
  const { search } = useLocation();
  const panelRef = useRef<HTMLElement>(null);
  const order = useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: id === null ? skipToken : ({ signal }) => getOrder(id, signal),
  });

  const close = useCallback(
    () => void navigate({ pathname: '/orders', search }),
    [navigate, search],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  useEffect(() => {
    panelRef.current?.focus(); // move focus into the panel so keyboard users land on it
  }, [id]);

  const onDeleted = (deletedId: number) => {
    onOrderDeleted(deletedId);
    void navigate({ pathname: '/orders', search });
  };

  let content;
  if (id === null) {
    content = <p>This order does not exist.</p>;
  } else if (order.isPending) {
    content = <p className="muted">Loading order…</p>;
  } else if (order.isError) {
    content = (
      <p className="alert alert--error" role="alert">
        {order.error instanceof ApiError && order.error.status === 404
          ? 'This order does not exist or has been deleted.'
          : errorMessage(order.error)}
      </p>
    );
  } else {
    content = <OrderDetails order={order.data} onDeleted={onDeleted} />;
  }

  return (
    <>
      <div className="drawer-backdrop" aria-hidden="true" onClick={close} />
      <aside
        ref={panelRef}
        className="drawer"
        role="dialog"
        aria-labelledby="order-drawer-title"
        tabIndex={-1}
      >
        <header className="drawer__header">
          <h2 id="order-drawer-title">Order #{orderId}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close order details"
            onClick={close}
          >
            ×
          </button>
        </header>
        <div className="drawer__body">{content}</div>
      </aside>
    </>
  );
}

function OrderDetails({
  order,
  onDeleted,
}: {
  order: OrderDetail;
  onDeleted: (orderId: number) => void;
}) {
  return (
    <>
      <dl className="details">
        <div>
          <dt>Customer</dt>
          <dd>
            <bdi>{order.customerName}</bdi>
            <br />
            <span className="muted">{order.customerEmail}</span>
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <StatusBadge status={order.status} />
          </dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>
            {formatDateTime(order.createdAt)}
            <br />
            <span className="muted">
              {order.createdBy ? `by ${order.createdBy.name}` : 'Imported from the spreadsheet'}
            </span>
          </dd>
        </div>
      </dl>
      <table className="items-table">
        <caption className="visually-hidden">Line items</caption>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col" className="num">
              Qty
            </th>
            <th scope="col" className="num">
              Unit price
            </th>
            <th scope="col" className="num">
              Line total
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td>{item.productName}</td>
              <td className="num">{item.quantity}</td>
              <td className="num">{formatMoney(item.unitPriceCents)}</td>
              <td className="num">{formatMoney(item.lineTotalCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              Order total
            </th>
            <td className="num">
              <strong>{formatMoney(order.totalCents)}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
      <AdminOnly>
        <DeleteOrderButton orderId={order.id} onDeleted={() => onDeleted(order.id)} />
      </AdminOnly>
    </>
  );
}
