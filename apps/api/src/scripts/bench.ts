// `npm run bench` — times every list/count query shape against the seeded database through the
// same repository code the API uses, prints p50/p95/max and the query plan, and compares keyset
// pagination with OFFSET at depth. Read-only: it never writes.
import { DEFAULT_PAGE_SIZE } from '@orders/shared';
import { loadDotEnv, resolveDatabasePath } from '../config';
import { openDatabase } from '../db/database';
import {
  buildListSql,
  createOrdersRepository,
  type ListFilters,
  type ListPageParams,
} from '../orders/orders.repository';

const ITERATIONS = 200;
const WARMUP = 10;

loadDotEnv();
const db = openDatabase(resolveDatabasePath());
const orders = createOrdersRepository(db);
const total = (db.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }).n;
const sampleEmail = (
  db.prepare('SELECT customer_email FROM orders ORDER BY id LIMIT 1 OFFSET 1234').get() as {
    customer_email: string;
  }
).customer_email;
const deep = db
  .prepare(
    'SELECT created_at, id FROM orders ORDER BY created_at DESC, id DESC LIMIT 1 OFFSET 40000',
  )
  .get() as { created_at: number; id: number };

const page = (params: Partial<ListPageParams>): ListPageParams => ({
  sort: 'createdAt',
  dir: 'desc',
  limit: DEFAULT_PAGE_SIZE,
  ...params,
});

const listCases: Array<[string, ListPageParams]> = [
  ['Default view: newest first', page({})],
  ['Status = shipped, amount high → low', page({ status: 'shipped', sort: 'total' })],
  ['Status = pending (rare), oldest first', page({ status: 'pending', dir: 'asc' })],
  [
    'Deep page: row 40,000 by keyset cursor',
    page({ after: { value: deep.created_at, id: deep.id } }),
  ],
  ['Search: one customer’s full email', page({ q: sampleEmail })],
  ['Search: "harbi" (common surname)', page({ q: 'harbi' })],
  ['Search: "example.com" (matches every row)', page({ q: 'example.com' })],
  ['Search: "al" (2 chars, LIKE fallback)', page({ q: 'al' })],
  ['Search: "zq" (2 chars, no match: full scan)', page({ q: 'zq' })],
  ['Search: order number "#25000"', page({ q: '#25000' })],
  [
    'Search "harbi" + status cancelled + amount',
    page({ q: 'harbi', status: 'cancelled', sort: 'total' }),
  ],
];

const countCases: Array<[string, ListFilters]> = [
  ['Count: all orders (capped at 10,000)', {}],
  ['Count: status = cancelled', { status: 'cancelled' }],
  ['Count: search "harbi"', { q: 'harbi' }],
];

interface Row {
  name: string;
  p50: number;
  p95: number;
  max: number;
  plan: string;
}

function time(fn: () => unknown): Omit<Row, 'name' | 'plan'> {
  for (let i = 0; i < WARMUP; i += 1) fn();
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const at = (q: number) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))]!;
  return { p50: at(0.5), p95: at(0.95), max: samples.at(-1)! };
}

function plan(sql: string, params: Record<string, unknown>): string {
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(params) as { detail: string }[];
  return rows
    .map((row) => row.detail)
    .filter((detail) => !detail.includes('order_items')) // the per-row item count subquery
    .join(' → ');
}

const rows: Row[] = [];
for (const [name, params] of listCases) {
  const { sql, params: bindings } = buildListSql(params);
  rows.push({ name, ...time(() => orders.listPage(params)), plan: plan(sql, bindings) });
}
for (const [name, filters] of countCases) {
  rows.push({ name, ...time(() => orders.countMatching(filters)), plan: '' });
}
rows.push({
  name: 'Stats: totals by status + revenue today',
  ...time(() => {
    orders.statusTotals();
    orders.revenueSince(Date.now() - 86_400_000);
  }),
  plan: '',
});

// The alternative that was rejected (DECISIONS.md #2): OFFSET pagination at the same depth.
const offsetSql = `SELECT o.id FROM orders o WHERE o.deleted_at IS NULL
                   ORDER BY o.created_at DESC, o.id DESC LIMIT 50 OFFSET 40000`;
const offset = time(() => db.prepare(offsetSql).all());

const ms = (value: number) => value.toFixed(2).padStart(7);
console.log(
  `\n${total.toLocaleString('en-US')} orders · ${ITERATIONS} runs per query after ${WARMUP} warm-up runs · times in ms\n`,
);
console.log(`| Query | p50 | p95 | max |\n|---|---:|---:|---:|`);
for (const row of rows)
  console.log(`| ${row.name} | ${ms(row.p50)} | ${ms(row.p95)} | ${ms(row.max)} |`);
console.log(
  `| *OFFSET 40,000 (rejected alternative)* | ${ms(offset.p50)} | ${ms(offset.p95)} | ${ms(offset.max)} |`,
);

console.log('\nQuery plans (list queries):');
for (const row of rows.filter((r) => r.plan)) console.log(`  ${row.name}\n    ${row.plan}`);

const worst = Math.max(...rows.map((row) => row.p95));
console.log(`\nWorst p95: ${worst.toFixed(2)} ms (target < 50 ms) ${worst < 50 ? '✔' : '✘'}`);
db.close();
