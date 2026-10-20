import {
  DEFAULT_PAGE_SIZE,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  type CreateOrderInput,
  type ListOrdersResponse,
  type OrderDetail,
  type OrderStats,
} from '@orders/shared';
import { devRequestHeaders } from '../dev/dev-flags';
import { apiRequest } from '../lib/api-client';
import type { OrderFilters } from './order-filters';

export const PAGE_SIZE = DEFAULT_PAGE_SIZE;
/** After this long we stop waiting and retry with the same key; the server dedupes. */
export const CREATE_TIMEOUT_MS = 10_000;

export async function listOrders(
  filters: OrderFilters & { cursor?: string | null },
  signal?: AbortSignal,
): Promise<ListOrdersResponse> {
  const query = new URLSearchParams({
    sort: filters.sort,
    dir: filters.dir,
    limit: String(PAGE_SIZE),
  });
  if (filters.q) query.set('q', filters.q);
  if (filters.status) query.set('status', filters.status);
  if (filters.cursor) query.set('cursor', filters.cursor);
  const { data } = await apiRequest<ListOrdersResponse>(`/orders?${query}`, {
    signal,
    headers: devRequestHeaders('list'),
  });
  return data;
}

export async function getOrder(id: number, signal?: AbortSignal): Promise<OrderDetail> {
  return (await apiRequest<OrderDetail>(`/orders/${id}`, { signal })).data;
}

export async function createOrder(
  input: CreateOrderInput,
  idempotencyKey: string,
): Promise<{ order: OrderDetail; replayed: boolean }> {
  const response = await apiRequest<OrderDetail>('/orders', {
    method: 'POST',
    body: input,
    headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    timeoutMs: CREATE_TIMEOUT_MS,
  });
  return {
    order: response.data,
    replayed: response.headers.get(IDEMPOTENT_REPLAYED_HEADER) === 'true',
  };
}

export async function deleteOrder(id: number): Promise<void> {
  await apiRequest<void>(`/orders/${id}`, { method: 'DELETE' });
}

export async function getOrderStats(signal?: AbortSignal): Promise<OrderStats> {
  return (
    await apiRequest<OrderStats>('/orders/stats', { signal, headers: devRequestHeaders('stats') })
  ).data;
}
