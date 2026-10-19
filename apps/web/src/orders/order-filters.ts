import {
  MAX_SEARCH_LENGTH,
  SORT_DIRECTIONS,
  SORT_FIELDS,
  orderStatusSchema,
  type OrderStatus,
  type SortDirection,
  type SortField,
} from '@orders/shared';
import { z } from 'zod';

/** The list's state. It lives in the URL, so a view can be reloaded, shared and navigated (R1-9). */
export interface OrderFilters {
  q?: string | undefined;
  status?: OrderStatus | undefined;
  sort: SortField;
  dir: SortDirection;
}

export const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Newest first', sort: 'createdAt', dir: 'desc' },
  { value: 'createdAt:asc', label: 'Oldest first', sort: 'createdAt', dir: 'asc' },
  { value: 'total:desc', label: 'Amount: high to low', sort: 'total', dir: 'desc' },
  { value: 'total:asc', label: 'Amount: low to high', sort: 'total', dir: 'asc' },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  sort: SortField;
  dir: SortDirection;
}>;

// A hand-edited or stale URL falls back to defaults instead of breaking the page.
const urlSchema = z.object({
  q: z.string().max(MAX_SEARCH_LENGTH).optional().catch(undefined),
  status: orderStatusSchema.optional().catch(undefined),
  sort: z.enum(SORT_FIELDS).catch('createdAt'),
  dir: z.enum(SORT_DIRECTIONS).catch('desc'),
});

export function parseOrderFilters(params: URLSearchParams): OrderFilters {
  return urlSchema.parse(Object.fromEntries(params));
}

/** Defaults are omitted so the plain list keeps a clean `/orders` URL. */
export function serializeOrderFilters(filters: OrderFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.status) params.set('status', filters.status);
  if (filters.sort !== 'createdAt') params.set('sort', filters.sort);
  if (filters.dir !== 'desc') params.set('dir', filters.dir);
  return params;
}

export function hasActiveFilters(filters: OrderFilters): boolean {
  return Boolean(filters.q || filters.status);
}
