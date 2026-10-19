import type { OrderStatus } from '@orders/shared';

export { formatMoney } from '@orders/shared';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

// Formatters are expensive to create; build them once, not per table row.
const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeStyle: 'medium' });
const countFormatter = new Intl.NumberFormat('en-US');

/** "19 Oct 2026, 14:05" in the agent's own time zone. */
export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

export function formatCount(value: number): string {
  return countFormatter.format(value);
}
