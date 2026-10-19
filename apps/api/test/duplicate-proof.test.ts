// R2-4 / R2-9 across OS processes: the guarantee must come from the database, not the event loop.
import { describe, expect, it } from 'vitest';
import { runDuplicateProof } from '../src/proof/duplicate-proof';

describe('duplicate proof (two API processes, one database)', () => {
  it('creates exactly one order per Idempotency-Key, however the requests are spread', async () => {
    const result = await runDuplicateProof();
    for (const scenario of result.scenarios) {
      expect(scenario.ordersWithKey, scenario.title).toBe(1);
      expect(scenario.passed, scenario.title).toBe(true);
    }
    expect(result.totalOrders).toBe(2);
    expect(result.passed).toBe(true);
  }, 60_000);
});
