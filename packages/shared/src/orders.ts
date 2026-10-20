import { z } from 'zod';
import { emailAddressSchema } from './fields';

export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/**
 * An order id from a URL: canonical decimal digits only. `Number()` alone would read `1e3` as
 * order 1000 and `0x10` as order 16; those are not ids.
 */
export function parseOrderId(raw: string | undefined): number | null {
  return raw !== undefined && /^[1-9]\d{0,8}$/.test(raw) ? Number(raw) : null;
}

/** Statuses counted as revenue (assumption A-5). */
export const REVENUE_STATUSES = [
  'paid',
  'shipped',
  'delivered',
] as const satisfies readonly OrderStatus[];

// ── R1 · list ────────────────────────────────────────────────────────────────

export const SORT_FIELDS = ['createdAt', 'total'] as const;
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const MAX_SEARCH_LENGTH = 100;
/** Counting stops after this many matches, so a count's cost is bounded at any table size. */
export const COUNT_CAP = 10_000;

export const listOrdersQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(MAX_SEARCH_LENGTH, `Search is limited to ${MAX_SEARCH_LENGTH} characters`)
    .optional()
    .transform((q) => q || undefined),
  status: orderStatusSchema.optional(),
  sort: z.enum(SORT_FIELDS).default('createdAt'),
  dir: z.enum(SORT_DIRECTIONS).default('desc'),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).max(200).optional(),
});
export type ListOrdersQuery = z.output<typeof listOrdersQuerySchema>;

// ── R2 · create ──────────────────────────────────────────────────────────────

export const MAX_ITEMS_PER_ORDER = 20;
export const MAX_QUANTITY = 999;
export const MAX_UNIT_PRICE_CENTS = 10_000_000; // SAR 100,000.00

export const customerNameSchema = z
  .string({ error: 'Enter the customer’s name' })
  .trim()
  .min(2, 'Enter the customer’s name (at least 2 characters)')
  .max(120, 'Name is too long (max 120 characters)');

export const productNameSchema = z
  .string({ error: 'Enter a product' })
  .trim()
  .min(1, 'Enter a product')
  .max(120, 'Product name is too long (max 120 characters)');

export const quantitySchema = z
  .number({ error: 'Enter a quantity' })
  .int('Use a whole number')
  .min(1, 'At least 1')
  .max(MAX_QUANTITY, `At most ${MAX_QUANTITY}`);

export const unitPriceCentsSchema = z
  .number({ error: 'Enter a price' })
  .int('Price must be a whole number of halalas')
  .min(1, 'Price must be greater than 0')
  .max(MAX_UNIT_PRICE_CENTS, 'Price is too high (max SAR 100,000.00)');

export const orderItemInputSchema = z.strictObject({
  productName: productNameSchema,
  quantity: quantitySchema,
  unitPriceCents: unitPriceCentsSchema,
});

/** The create-order contract. Strict: a client cannot send a total, a status or a creator. */
export const createOrderInputSchema = z.strictObject({
  customer: z.strictObject({
    name: customerNameSchema,
    email: emailAddressSchema,
  }),
  items: z
    .array(orderItemInputSchema)
    .min(1, 'Add at least one item')
    .max(MAX_ITEMS_PER_ORDER, `At most ${MAX_ITEMS_PER_ORDER} items per order`),
});
export type CreateOrderInput = z.output<typeof createOrderInputSchema>;

export const idempotencyKeySchema = z.uuid('Idempotency-Key must be a UUID');

// ── Response DTOs ────────────────────────────────────────────────────────────

export interface OrderSummary {
  id: number;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  totalCents: number;
  itemCount: number;
  createdAt: string;
}

export interface ListOrdersResponse {
  items: OrderSummary[];
  nextCursor: string | null;
  /** Present on the first page only. `capped` means "at least COUNT_CAP". */
  total: { count: number; capped: boolean } | null;
}

export interface OrderItem {
  id: number;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface OrderDetail extends Omit<OrderSummary, 'itemCount'> {
  createdBy: { id: number; name: string } | null;
  items: OrderItem[];
}

export interface StatusTotals {
  status: OrderStatus;
  count: number;
  totalCents: number;
}

export interface OrderStats {
  byStatus: StatusTotals[];
  revenueToday: {
    totalCents: number;
    orderCount: number;
    /** ISO instant of local midnight in `timeZone`. */
    since: string;
    timeZone: string;
  };
  generatedAt: string;
}
