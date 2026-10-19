// `npm run setup` — one-time local setup: creates .env with a random JWT secret, then seeds
// the database if it is missing or empty. Safe to re-run; it never overwrites an existing secret.
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, loadDotEnv, resolveDatabasePath } from '../config';
import { openDatabase } from '../db/database';
import { seedDatabase } from '../db/seed';
import { SEED_USERS } from '../db/seed-data';

const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 19) || (major === 22 && minor < 13)) {
  console.error(
    `Node ${process.versions.node} is too old: use Node 20.19+, 22.13+ or 24+ (see .nvmrc).`,
  );
  process.exit(1);
}

const envFile = path.join(REPO_ROOT, '.env');
if (!existsSync(envFile)) copyFileSync(path.join(REPO_ROOT, '.env.example'), envFile);
const env = readFileSync(envFile, 'utf8');
if (/^JWT_SECRET=\s*$/m.test(env)) {
  const secret = randomBytes(48).toString('base64url');
  writeFileSync(envFile, env.replace(/^JWT_SECRET=\s*$/m, `JWT_SECRET=${secret}`));
  console.log('✔ .env created with a random JWT_SECRET');
} else {
  console.log('✔ .env already has a JWT_SECRET (left unchanged)');
}

loadDotEnv();
const databasePath = resolveDatabasePath();
const existingOrders = countOrders(databasePath);
if (existingOrders > 0) {
  console.log(
    `✔ Database already seeded with ${existingOrders.toLocaleString('en-US')} orders. ` +
      'Run `npm run seed` to reset it.',
  );
} else {
  console.log('… Seeding 50,000 orders (a few seconds)');
  const summary = await seedDatabase({ databasePath });
  console.log(`✔ Seeded ${summary.orders.toLocaleString('en-US')} orders → ${databasePath}`);
}

console.log('\nSign in with:');
console.table(SEED_USERS.map(({ email, password, role }) => ({ email, password, role })));
console.log('Next: npm run dev  →  http://localhost:5173');

function countOrders(file: string): number {
  if (!existsSync(file)) return 0;
  const db = openDatabase(file, { readonly: true });
  try {
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'orders'")
      .get();
    if (!table) return 0;
    return (db.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }).n;
  } finally {
    db.close();
  }
}
