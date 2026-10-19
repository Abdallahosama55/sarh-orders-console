import {
  COUNT_CAP,
  ORDER_STATUSES,
  REVENUE_STATUSES,
  type OrderDetail,
  type OrderStatus,
  type OrderSummary,
  type SortDirection,
  type SortField,
  type StatusTotals,
} from '@orders/shared';
import type { Statement } from 'better-sqlite3';
import type { Db } from '../db/database';

export interface ListFilters {
  q?: string | undefined;
  status?: OrderStatus | undefined;
}

export interface ListPageParams extends ListFilters {
  sort: SortField;
  dir: SortDirection;
  limit: number;
  /** Keyset position: rows strictly after (value, id) in the requested order. */
  after?: { value: number; id: number } | undefined;
}

export interface ListPage {
  items: OrderSummary[];
  next: { value: number; id: number } | null;
}

export interface NewOrder {
  customerName: string;
  customerEmail: string;
  items: ReadonlyArray<{ productName: string; quantity: number; unitPriceCents: number }>;
  totalCents: number;
  createdBy: number;
  idempotencyKey: string;
  fingerprint: string;
  createdAt: number;
}

export type InsertOnceResult =
  | { kind: 'created'; orderId: number }
  | { kind: 'replayed'; orderId: number }
  | { kind: 'conflict'; orderId: number };

type SqlParams = Record<string, string | number>;

/** Whitelist: user input picks a key, never SQL text. */
const SORT_COLUMN: Record<SortField, string> = {
  createdAt: 'o.created_at',
  total: 'o.total_cents',
};
const ORDER_NUMBER = /^#?([1-9]\d{0,8})$/;
/** The trigram index needs at least three characters to look anything up. */
const TRIGRAM_MIN_CHARS = 3;

/**
 * WHERE clauses shared by the page query and the count query. Search strategy (design §5.1):
 * an order number goes to the primary key, three or more characters go to the trigram index,
 * and shorter input falls back to an escaped LIKE scan that stops at the page LIMIT.
 */
export function buildFilterSql({ q, status }: ListFilters): { where: string[]; params: SqlParams } {
  const where = ['o.deleted_at IS NULL'];
  const params: SqlParams = {};
  if (status) {
    where.push('o.status = @status');
    params.status = status;
  }
  if (q) {
    const orderNumber = ORDER_NUMBER.exec(q)?.[1];
    if (orderNumber) {
      where.push('o.id = @orderNumber');
      params.orderNumber = Number(orderNumber);
    } else if ([...q].length >= TRIGRAM_MIN_CHARS) {
      where.push('o.id IN (SELECT rowid FROM orders_search WHERE orders_search MATCH @phrase)');
      params.phrase = `"${q.replaceAll('"', '""')}"`; // an FTS5 string literal: everything inside is literal
    } else {
      where.push(
        `(o.customer_name LIKE @like ESCAPE '\\' OR o.customer_email LIKE @like ESCAPE '\\')`,
      );
      params.like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    }
  }
  return { where, params };
}

/** Exported so tests and the benchmark can EXPLAIN exactly the SQL the API runs. */
export function buildListSql(page: ListPageParams): { sql: string; params: SqlParams } {
  const { where, params } = buildFilterSql(page);
  const column = SORT_COLUMN[page.sort];
  const direction = page.dir === 'asc' ? 'ASC' : 'DESC';
  if (page.after) {
    // Row-value comparison = "after this (value, id) position" in one index range seek.
    where.push(`(${column}, o.id) ${page.dir === 'asc' ? '>' : '<'} (@afterValue, @afterId)`);
    params.afterValue = page.after.value;
    params.afterId = page.after.id;
  }
  params.limit = page.limit + 1; // one extra row tells us whether a next page exists
  const sql = `
    SELECT o.id, o.customer_name, o.customer_email, o.status, o.total_cents, o.created_at,
           (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
    FROM orders o
    WHERE ${where.join('\n      AND ')}
    ORDER BY ${column} ${direction}, o.id ${direction}
    LIMIT @limit`;
  return { sql, params };
}

interface OrderRow {
  id: number;
  customer_name: string;
  customer_email: string;
  status: OrderStatus;
  total_cents: number;
  created_at: number;
}

interface SummaryRow extends OrderRow {
  item_count: number;
}

interface DetailRow extends OrderRow {
  creator_id: number | null;
  creator_name: string | null;
}

interface ItemRow {
  id: number;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
}

export type OrdersRepository = ReturnType<typeof createOrdersRepository>;

export function createOrdersRepository(db: Db) {
  // The list SQL varies with the filters, but only across a few dozen shapes; cache their statements.
  const dynamicStatements = new Map<string, Statement>();
  const prepareCached = (sql: string) => {
    let statement = dynamicStatements.get(sql);
    if (!statement) {
      statement = db.prepare(sql);
      dynamicStatements.set(sql, statement);
    }
    return statement;
  };

  const detail = db.prepare<[number], DetailRow>(`
    SELECT o.id, o.customer_name, o.customer_email, o.status, o.total_cents, o.created_at,
           u.id AS creator_id, u.name AS creator_name
    FROM orders o LEFT JOIN users u ON u.id = o.created_by
    WHERE o.id = ? AND o.deleted_at IS NULL`);
  const itemsOf = db.prepare<[number], ItemRow>(
    'SELECT id, product_name, quantity, unit_price_cents FROM order_items WHERE order_id = ? ORDER BY id',
  );
  const insertOrder = db.prepare<[NewOrder], { id: number }>(`
    INSERT INTO orders (customer_name, customer_email, status, total_cents, created_at,
                        created_by, idempotency_key, request_fingerprint)
    VALUES (@customerName, @customerEmail, 'pending', @totalCents, @createdAt,
            @createdBy, @idempotencyKey, @fingerprint)
    ON CONFLICT (created_by, idempotency_key) DO NOTHING
    RETURNING id`);
  const insertItem = db.prepare<[number, string, number, number]>(
    'INSERT INTO order_items (order_id, product_name, quantity, unit_price_cents) VALUES (?, ?, ?, ?)',
  );
  const findByKey = db.prepare<[number, string], { id: number; request_fingerprint: string }>(
    'SELECT id, request_fingerprint FROM orders WHERE created_by = ? AND idempotency_key = ?',
  );
  const softDelete = db.prepare<[number, number, number]>(
    'UPDATE orders SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL',
  );
  const totalsByStatus = db.prepare<
    [],
    { status: OrderStatus; count: number; total_cents: number }
  >(`
    SELECT status, COUNT(*) AS count, COALESCE(SUM(total_cents), 0) AS total_cents
    FROM orders WHERE deleted_at IS NULL GROUP BY status`);
  // REVENUE_STATUSES are compile-time constants, not user input.
  const revenueSince = db.prepare<[number], { count: number; total_cents: number }>(`
    SELECT COUNT(*) AS count, COALESCE(SUM(total_cents), 0) AS total_cents
    FROM orders
    WHERE deleted_at IS NULL AND created_at >= ?
      AND status IN (${REVENUE_STATUSES.map((status) => `'${status}'`).join(', ')})`);

  /**
   * R2's guarantee lives here: the unique (created_by, idempotency_key) index decides, inside
   * one IMMEDIATE transaction, whether this request creates the order or finds an existing
   * one. That holds across processes, not just across requests in this event loop.
   */
  const insertOnceTransaction = db.transaction((order: NewOrder): InsertOnceResult => {
    const inserted = insertOrder.get(order);
    if (inserted) {
      for (const item of order.items) {
        insertItem.run(inserted.id, item.productName, item.quantity, item.unitPriceCents);
      }
      return { kind: 'created', orderId: inserted.id };
    }
    const existing = findByKey.get(order.createdBy, order.idempotencyKey);
    if (!existing) throw new Error('Idempotency conflict reported but no matching order was found');
    return existing.request_fingerprint === order.fingerprint
      ? { kind: 'replayed', orderId: existing.id }
      : { kind: 'conflict', orderId: existing.id };
  });

  return {
    listPage(page: ListPageParams): ListPage {
      const { sql, params } = buildListSql(page);
      const rows = prepareCached(sql).all(params) as SummaryRow[];
      const pageRows = rows.slice(0, page.limit);
      const last = pageRows.at(-1);
      const hasMore = rows.length > page.limit;
      return {
        items: pageRows.map(toSummary),
        next:
          hasMore && last
            ? { value: page.sort === 'createdAt' ? last.created_at : last.total_cents, id: last.id }
            : null,
      };
    },

    /** Stops counting at COUNT_CAP + 1 rows, so the cost is bounded at any table size. */
    countMatching(filters: ListFilters): { count: number; capped: boolean } {
      const { where, params } = buildFilterSql(filters);
      const sql = `SELECT COUNT(*) AS n FROM (SELECT 1 FROM orders o WHERE ${where.join(' AND ')} LIMIT ${COUNT_CAP + 1})`;
      const { n } = prepareCached(sql).get(params) as { n: number };
      return { count: Math.min(n, COUNT_CAP), capped: n > COUNT_CAP };
    },

    getOrderDetail(id: number): OrderDetail | undefined {
      const row = detail.get(id);
      if (!row) return undefined;
      return {
        ...toOrderFields(row),
        createdBy:
          row.creator_id === null ? null : { id: row.creator_id, name: row.creator_name ?? '' },
        items: itemsOf.all(id).map((item) => ({
          id: item.id,
          productName: item.product_name,
          quantity: item.quantity,
          unitPriceCents: item.unit_price_cents,
          lineTotalCents: item.quantity * item.unit_price_cents,
        })),
      };
    },

    insertOrderOnce(order: NewOrder): InsertOnceResult {
      return insertOnceTransaction.immediate(order);
    },

    softDeleteOrder(id: number, deletedBy: number, now: number): boolean {
      return softDelete.run(now, deletedBy, id).changes === 1;
    },

    statusTotals(): StatusTotals[] {
      const rows = new Map(totalsByStatus.all().map((row) => [row.status, row]));
      return ORDER_STATUSES.map((status) => ({
        status,
        count: rows.get(status)?.count ?? 0,
        totalCents: rows.get(status)?.total_cents ?? 0,
      }));
    },

    revenueSince(since: number): { count: number; totalCents: number } {
      const row = revenueSince.get(since) ?? { count: 0, total_cents: 0 };
      return { count: row.count, totalCents: row.total_cents };
    },
  };
}

function toOrderFields(row: OrderRow): Omit<OrderSummary, 'itemCount'> {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    status: row.status,
    totalCents: row.total_cents,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function toSummary(row: SummaryRow): OrderSummary {
  return { ...toOrderFields(row), itemCount: row.item_count };
}
