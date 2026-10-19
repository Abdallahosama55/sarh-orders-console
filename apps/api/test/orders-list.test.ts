// R1: list correctness (exhaustive paging), search, validation and query plans.
import {
  ORDER_STATUSES,
  SORT_DIRECTIONS,
  SORT_FIELDS,
  type ListOrdersResponse,
  type OrderStatus,
  type SortDirection,
  type SortField,
} from '@orders/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodeCursor } from '../src/orders/list-cursor';
import { buildListSql } from '../src/orders/orders.repository';
import { AGENT, FIXED_NOW, createTestContext, signIn, type TestContext } from './helpers';

type Client = Awaited<ReturnType<typeof signIn>>;

let ctx: TestContext;
let client: Client;

const SORT_SQL: Record<SortField, string> = { createdAt: 'created_at', total: 'total_cents' };

beforeAll(async () => {
  ctx = await createTestContext({ orders: 400 });
  // Five orders sharing one timestamp, so date sorting must fall back to the id tie-breaker.
  const insert = ctx.db.prepare(
    "INSERT INTO orders (customer_name, customer_email, status, total_cents, created_at) VALUES ('Tie Breaker', 'tie@example.com', 'paid', 1000, ?)",
  );
  for (let i = 0; i < 5; i += 1) insert.run(FIXED_NOW - 60_000);
  // A name with an apostrophe, so the literal-quote search test can never pass vacuously.
  ctx.db
    .prepare(
      "INSERT INTO orders (customer_name, customer_email, status, total_cents, created_at) VALUES ('Liam O''Brien', 'liam.obrien@example.com', 'paid', 2500, ?)",
    )
    .run(FIXED_NOW - 120_000);
  client = await signIn(ctx.app, AGENT);
});
afterAll(() => ctx.close());

/** Independent reference: the same ordering computed by one plain SQL query. */
function referenceIds(sort: SortField, dir: SortDirection, status?: OrderStatus): number[] {
  const where = status ? 'AND status = ?' : '';
  const rows = ctx.db
    .prepare(
      `SELECT id FROM orders WHERE deleted_at IS NULL ${where}
       ORDER BY ${SORT_SQL[sort]} ${dir}, id ${dir}`,
    )
    .all(...(status ? [status] : [])) as { id: number }[];
  return rows.map((row) => row.id);
}

async function fetchAllPages(
  params: Record<string, string>,
): Promise<{ ids: number[]; pages: number }> {
  const ids: number[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const query = new URLSearchParams({ ...params, ...(cursor ? { cursor } : {}) });
    const body = (await client.get(`/api/orders?${query}`).expect(200)).body as ListOrdersResponse;
    ids.push(...body.items.map((order) => order.id));
    if (pages > 0) expect(body.total).toBeNull(); // counted on the first page only
    cursor = body.nextCursor;
    pages += 1;
  } while (cursor);
  return { ids, pages };
}

describe('keyset pagination', () => {
  const shapes = SORT_FIELDS.flatMap((sort) =>
    SORT_DIRECTIONS.flatMap((dir) =>
      [undefined, 'cancelled', 'delivered'].map((status) => ({ sort, dir, status })),
    ),
  );

  it.each(shapes)(
    'returns every row exactly once, in order, for sort=$sort dir=$dir status=$status',
    async ({ sort, dir, status }) => {
      const params: Record<string, string> = { sort, dir, limit: '7' };
      if (status) params.status = status;
      const { ids, pages } = await fetchAllPages(params);
      const expected = referenceIds(sort, dir, status as OrderStatus | undefined);
      expect(ids).toEqual(expected);
      expect(pages).toBe(Math.ceil(expected.length / 7) || 1);
    },
  );

  it('stays stable while new orders are inserted between pages (no duplicates, no skips)', async () => {
    const first = (await client.get('/api/orders?limit=10').expect(200)).body as ListOrdersResponse;
    const expectedRest = referenceIds('createdAt', 'desc').slice(10, 20);

    ctx.db
      .prepare(
        "INSERT INTO orders (customer_name, customer_email, status, total_cents, created_at) VALUES ('Late Arrival', 'late@example.com', 'pending', 500, ?)",
      )
      .run(Date.now());

    const second = (await client.get(`/api/orders?limit=10&cursor=${first.nextCursor}`).expect(200))
      .body as ListOrdersResponse;
    expect(second.items.map((order) => order.id)).toEqual(expectedRest);
  });

  it('reports the total on the first page', async () => {
    const body = (await client.get('/api/orders?status=cancelled').expect(200))
      .body as ListOrdersResponse;
    expect(body.total).toEqual({
      count: referenceIds('createdAt', 'desc', 'cancelled').length,
      capped: false,
    });
  });

  it('includes the item count and never returns more than 100 rows', async () => {
    const body = (await client.get('/api/orders?limit=100').expect(200)).body as ListOrdersResponse;
    expect(body.items).toHaveLength(100);
    const [first] = body.items;
    const { n } = ctx.db
      .prepare('SELECT COUNT(*) AS n FROM order_items WHERE order_id = ?')
      .get(first!.id) as { n: number };
    expect(first!.itemCount).toBe(n);
    await client.get('/api/orders?limit=101').expect(400);
  });

  // Search results are sorted by SQLite's sorter rather than read in index order, so only the
  // explicit `, id` tie-breaker keeps rows that share a timestamp in keyset order. The five
  // "Tie Breaker" rows share one created_at value.
  const searchShapes = ['Tie Breaker', 'example.org', 'Ti'].flatMap((q) =>
    SORT_FIELDS.flatMap((sort) => SORT_DIRECTIONS.map((dir) => ({ q, sort, dir }))),
  );

  it.each(searchShapes)(
    'returns every search result exactly once for q=$q sort=$sort dir=$dir',
    async ({ q, sort, dir }) => {
      const { ids } = await fetchAllPages({ q, sort, dir, limit: '2' });
      const expected = (
        ctx.db
          .prepare(
            `SELECT id FROM orders
             WHERE deleted_at IS NULL
               AND (instr(lower(customer_name), lower(?)) > 0 OR instr(lower(customer_email), lower(?)) > 0)
             ORDER BY ${SORT_SQL[sort]} ${dir}, id ${dir}`,
          )
          .all(q, q) as { id: number }[]
      ).map((row) => row.id);
      expect(expected.length).toBeGreaterThan(1);
      expect(ids).toEqual(expected);
    },
  );
});

describe('search', () => {
  const search = async (q: string) =>
    (await client.get(`/api/orders?limit=100&q=${encodeURIComponent(q)}`).expect(200))
      .body as ListOrdersResponse;

  const referenceSearchCount = (needle: string) =>
    (
      ctx.db
        .prepare(
          'SELECT COUNT(*) AS n FROM orders WHERE deleted_at IS NULL AND (instr(lower(customer_name), lower(?)) > 0 OR instr(lower(customer_email), lower(?)) > 0)',
        )
        .get(needle, needle) as { n: number }
    ).n;

  it('matches a substring of the name, case-insensitively, through the trigram index', async () => {
    const { customer_name } = ctx.db
      .prepare("SELECT customer_name FROM orders WHERE customer_name LIKE '%Al-%' LIMIT 1")
      .get() as { customer_name: string };
    const fragment = customer_name.split(' ')[1]!.slice(3).toUpperCase(); // e.g. "HARBI"
    const body = await search(fragment);
    expect(body.items.length).toBeGreaterThan(0);
    for (const order of body.items) {
      expect(`${order.customerName} ${order.customerEmail}`.toLowerCase()).toContain(
        fragment.toLowerCase(),
      );
    }
    expect(body.total?.count).toBe(referenceSearchCount(fragment));
  });

  it('matches part of an email', async () => {
    const { customer_email } = ctx.db
      .prepare('SELECT customer_email FROM orders ORDER BY id LIMIT 1')
      .get() as { customer_email: string };
    const body = await search(customer_email);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((order) => order.customerEmail === customer_email)).toBe(true);
  });

  it('falls back to a scan for one- and two-character searches', async () => {
    const body = await search('Al');
    expect(body.total?.count).toBe(referenceSearchCount('Al'));
  });

  it('finds Arabic-script names', async () => {
    const { customer_name } = ctx.db
      .prepare(
        "SELECT customer_name FROM orders WHERE customer_email LIKE '%.al%' AND customer_name NOT GLOB '*[A-Za-z]*' LIMIT 1",
      )
      .get() as { customer_name: string };
    const lastName = customer_name.split(' ')[1]!;
    const body = await search(lastName);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((order) => order.customerName.includes(lastName))).toBe(true);
  });

  it('treats quotes, % and _ literally', async () => {
    const apostrophe = await search("o'b");
    expect(apostrophe.items.length).toBeGreaterThan(0);
    expect(apostrophe.items.every((order) => order.customerName.includes("O'Brien"))).toBe(true);
    expect(apostrophe.total?.count).toBe(referenceSearchCount("o'b"));
    for (const literal of ['%', '_', '%%%', '"', 'a"b', '___']) {
      expect((await search(literal)).items).toEqual([]);
    }
  });

  it('looks up an order number with or without #', async () => {
    expect((await search('#42')).items.map((order) => order.id)).toEqual([42]);
    expect((await search('42')).items.map((order) => order.id)).toEqual([42]);
  });

  it('combines search with the status filter', async () => {
    const body = (
      await client.get('/api/orders?q=example.com&status=cancelled&limit=100').expect(200)
    ).body as ListOrdersResponse;
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((order) => order.status === 'cancelled')).toBe(true);
  });
});

describe('validation', () => {
  it.each([
    ['unknown status', 'status=lost'],
    ['repeated status', 'status=paid&status=shipped'],
    ['unknown sort', 'sort=name'],
    ['zero limit', 'limit=0'],
    ['search too long', `q=${'x'.repeat(101)}`],
  ])('rejects %s with 400', async (_label, query) => {
    const response = await client.get(`/api/orders?${query}`).expect(400);
    expect(response.body.error.code).toBe('validation_failed');
  });

  it('rejects tampered cursors and cursors from another sort order', async () => {
    await client.get('/api/orders?cursor=not-a-cursor').expect(400);
    const totalCursor = encodeCursor({ sort: 'total', dir: 'desc', value: 1000, id: 5 });
    const response = await client
      .get(`/api/orders?sort=createdAt&cursor=${totalCursor}`)
      .expect(400);
    expect(response.body.error.code).toBe('invalid_cursor');
  });
});

describe('query plans (R1-7)', () => {
  const plan = (params: Parameters<typeof buildListSql>[0]) => {
    const { sql, params: bindings } = buildListSql(params);
    return (ctx.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(bindings) as { detail: string }[])
      .map((row) => row.detail)
      .join(' | ');
  };

  const shapes = SORT_FIELDS.flatMap((sort) =>
    SORT_DIRECTIONS.flatMap((dir) =>
      [undefined, ...ORDER_STATUSES.slice(0, 1)].flatMap((status) =>
        [undefined, { value: 1, id: 1 }].map((after) => ({ sort, dir, status, after })),
      ),
    ),
  );

  it.each(shapes)(
    'sort=$sort dir=$dir status=$status after=$after is served by an index without a sort step',
    ({ sort, dir, status, after }) => {
      const detail = plan({ sort, dir, status, after, limit: 50 });
      expect(detail).toMatch(/USING (COVERING )?INDEX orders_(status_)?(created|total)_idx/);
      expect(detail).not.toContain('TEMP B-TREE');
    },
  );

  it('uses the trigram index for searches of three or more characters', () => {
    expect(plan({ sort: 'createdAt', dir: 'desc', q: 'harbi', limit: 50 })).toContain(
      'SCAN orders_search VIRTUAL TABLE',
    );
  });
});

describe('count cap', () => {
  it('stops counting at 10,000 and says so', async () => {
    const big = await createTestContext({ orders: 10_050 });
    try {
      const bigClient = await signIn(big.app, AGENT);
      const body = (await bigClient.get('/api/orders').expect(200)).body as ListOrdersResponse;
      expect(body.total).toEqual({ count: 10_000, capped: true });
    } finally {
      big.close();
    }
  });
});
