import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { openDatabase } from './database';
import { seedDatabase } from './seed';

const directory = mkdtempSync(path.join(os.tmpdir(), 'orders-seed-test-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

async function seedAndDigest(name: string) {
  const databasePath = path.join(directory, `${name}.db`);
  const summary = await seedDatabase({
    databasePath,
    orderCount: 500,
    now: Date.parse('2026-10-19T09:00:00Z'),
  });
  const db = openDatabase(databasePath, { readonly: true });
  try {
    const hash = createHash('sha256');
    for (const row of db.prepare('SELECT * FROM orders ORDER BY id').iterate())
      hash.update(JSON.stringify(row));
    for (const row of db.prepare('SELECT * FROM order_items ORDER BY id').iterate())
      hash.update(JSON.stringify(row));
    const itemsPerOrder = db
      .prepare(
        'SELECT MIN(n) AS min, MAX(n) AS max FROM (SELECT COUNT(*) AS n FROM order_items GROUP BY order_id)',
      )
      .get() as { min: number; max: number };
    const mismatchedTotals = db
      .prepare(
        `SELECT COUNT(*) AS n FROM orders o
         WHERE o.total_cents != (SELECT SUM(quantity * unit_price_cents) FROM order_items WHERE order_id = o.id)`,
      )
      .get() as { n: number };
    return {
      summary,
      digest: hash.digest('hex'),
      itemsPerOrder,
      mismatchedTotals: mismatchedTotals.n,
    };
  } finally {
    db.close();
  }
}

describe('seedDatabase (R1-12)', () => {
  it('is deterministic: the same seed and clock produce byte-identical data', async () => {
    const first = await seedAndDigest('first');
    const second = await seedAndDigest('second');
    expect(second.digest).toBe(first.digest);
    expect(first.summary).toMatchObject({ users: 3, orders: 500 });
  });

  it('gives every order 1–5 line items and a total equal to the sum of its lines', async () => {
    const { itemsPerOrder, mismatchedTotals } = await seedAndDigest('shape');
    expect(itemsPerOrder).toEqual({ min: 1, max: 5 });
    expect(mismatchedTotals).toBe(0);
  });
});
