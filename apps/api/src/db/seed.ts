import { computeTotalCents, type OrderStatus } from '@orders/shared';
import { hashPassword } from '../auth/password';
import { createUsersRepository } from '../auth/users.repository';
import { migrate, openDatabase, removeDatabaseFiles } from './database';
import {
  ARABIC_FIRST_NAMES,
  ARABIC_LAST_NAMES,
  EMAIL_DOMAINS,
  LATIN_FIRST_NAMES,
  LATIN_LAST_NAMES,
  PRODUCTS,
  SEED_USERS,
} from './seed-data';

export const DEFAULT_ORDER_COUNT = 50_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** "Tens of thousands of orders a month": 50,000 orders spread over the last 90 days. */
const HISTORY_DAYS = 90;
const ARABIC_SCRIPT_SHARE = 0.06;

export interface SeedOptions {
  databasePath: string;
  orderCount?: number;
  /** Order dates are relative to this instant, so "today" always has orders. */
  now?: number;
  /** Same seed → same customers, items and amounts (R1-12). */
  seed?: number;
}

export interface SeedSummary {
  users: number;
  orders: number;
  items: number;
}

interface Customer {
  name: string;
  email: string;
}

/** Recreates the database from scratch: schema, users and `orderCount` orders. */
export async function seedDatabase({
  databasePath,
  orderCount = DEFAULT_ORDER_COUNT,
  now = Date.now(),
  seed = 2026,
}: SeedOptions): Promise<SeedSummary> {
  removeDatabaseFiles(databasePath);
  const db = openDatabase(databasePath);
  try {
    migrate(db);
    db.pragma('synchronous = OFF'); // bulk load of a throw-away file; each normal open sets FULL

    const users = createUsersRepository(db);
    for (const user of SEED_USERS) {
      users.insert({ ...user, passwordHash: await hashPassword(user.password), createdAt: now });
    }

    const random = mulberry32(seed);
    const customers = createCustomers(random, Math.max(1, Math.round(orderCount / 6)));
    // Generate ages first and insert oldest → newest so ids follow creation time, as in production.
    const historyMs = HISTORY_DAYS * DAY_MS;
    const createdAts = Array.from(
      { length: orderCount },
      () => now - Math.floor(random() * historyMs),
    );
    createdAts.sort((a, b) => a - b);

    const insertOrder = db.prepare<[string, string, OrderStatus, number, number]>(
      `INSERT INTO orders (customer_name, customer_email, status, total_cents, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const insertItem = db.prepare<[number | bigint, string, number, number]>(
      'INSERT INTO order_items (order_id, product_name, quantity, unit_price_cents) VALUES (?, ?, ?, ?)',
    );

    let itemCount = 0;
    db.transaction(() => {
      for (const createdAt of createdAts) {
        // Skewed pick: a minority of customers order often, like real repeat buyers.
        const customer = customers[Math.floor(random() ** 1.6 * customers.length)]!;
        const items = createItems(random);
        const status = statusForAge(now - createdAt, random);
        const { lastInsertRowid } = insertOrder.run(
          customer.name,
          customer.email,
          status,
          computeTotalCents(items),
          createdAt,
        );
        for (const item of items) {
          insertItem.run(lastInsertRowid, item.productName, item.quantity, item.unitPriceCents);
        }
        itemCount += items.length;
      }
    })();

    db.exec('ANALYZE'); // give the query planner real statistics for the composite indexes
    return { users: SEED_USERS.length, orders: orderCount, items: itemCount };
  } finally {
    db.close();
  }
}

function createCustomers(random: () => number, count: number): Customer[] {
  const customers: Customer[] = [];
  const emails = new Set<string>();
  while (customers.length < count) {
    const customer =
      random() < ARABIC_SCRIPT_SHARE ? arabicCustomer(random) : latinCustomer(random);
    if (emails.has(customer.email)) continue;
    emails.add(customer.email);
    customers.push(customer);
  }
  return customers;
}

function latinCustomer(random: () => number): Customer {
  const first = pick(random, LATIN_FIRST_NAMES);
  const last = pick(random, LATIN_LAST_NAMES);
  const handle = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '');
  return {
    name: `${first} ${last}`,
    email: `${handle}${emailSuffix(random)}@${pick(random, EMAIL_DOMAINS)}`,
  };
}

function arabicCustomer(random: () => number): Customer {
  const [firstArabic, firstLatin] = pick(random, ARABIC_FIRST_NAMES);
  const [lastArabic, lastLatin] = pick(random, ARABIC_LAST_NAMES);
  return {
    name: `${firstArabic} ${lastArabic}`,
    email: `${firstLatin}.${lastLatin}${emailSuffix(random)}@${pick(random, EMAIL_DOMAINS)}`,
  };
}

function emailSuffix(random: () => number): string {
  return random() < 0.3 ? '' : String(Math.floor(random() * 999) + 1);
}

function createItems(random: () => number) {
  const count = weighted(random, [
    [1, 40],
    [2, 25],
    [3, 18],
    [4, 10],
    [5, 7],
  ]);
  const products = [...PRODUCTS];
  return Array.from({ length: count }, () => {
    const [product] = products.splice(Math.floor(random() * products.length), 1);
    return {
      productName: product!.name,
      quantity: weighted(random, [
        [1, 70],
        [2, 20],
        [3, 7],
        [4, 2],
        [5, 1],
      ]),
      unitPriceCents: product!.priceCents,
    };
  });
}

/** Older orders have progressed further through fulfilment; ~10% end up cancelled. */
function statusForAge(ageMs: number, random: () => number): OrderStatus {
  const days = ageMs / DAY_MS;
  if (days < 1)
    return weighted(random, [
      ['pending', 45],
      ['paid', 45],
      ['cancelled', 10],
    ]);
  if (days < 3)
    return weighted(random, [
      ['pending', 5],
      ['paid', 30],
      ['shipped', 55],
      ['cancelled', 10],
    ]);
  if (days < 10)
    return weighted(random, [
      ['shipped', 35],
      ['delivered', 55],
      ['cancelled', 10],
    ]);
  return weighted(random, [
    ['delivered', 90],
    ['cancelled', 10],
  ]);
}

function weighted<T>(random: () => number, options: ReadonlyArray<readonly [T, number]>): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return options[options.length - 1]![0];
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
}

/** Small, fast, seedable PRNG: the seed must be reproducible, so Math.random is out. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
