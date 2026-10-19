import type { OrderStatus } from '@orders/shared';
import { STATUS_LABELS } from '../lib/format';

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge badge--${status}`}>{STATUS_LABELS[status]}</span>;
}
