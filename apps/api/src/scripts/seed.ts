// `npm run seed [-- --orders=50000]` — recreates the database with deterministic data.
import { loadDotEnv, resolveDatabasePath } from '../config';
import { DEFAULT_ORDER_COUNT, seedDatabase } from '../db/seed';
import { SEED_USERS } from '../db/seed-data';

loadDotEnv();
const databasePath = resolveDatabasePath();
const orderCount = Number(
  process.argv.find((arg) => arg.startsWith('--orders='))?.split('=')[1] ?? DEFAULT_ORDER_COUNT,
);
if (!Number.isInteger(orderCount) || orderCount < 0) {
  console.error('--orders must be a non-negative integer');
  process.exit(1);
}

const startedAt = performance.now();
const summary = await seedDatabase({ databasePath, orderCount });
const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);

console.log(
  `Seeded ${summary.orders.toLocaleString('en-US')} orders (${summary.items.toLocaleString('en-US')} line items) ` +
    `and ${summary.users} users in ${seconds}s → ${databasePath}`,
);
console.table(SEED_USERS.map(({ email, password, role }) => ({ email, password, role })));
