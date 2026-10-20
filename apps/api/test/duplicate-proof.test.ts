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

  it('fails fast, instead of hanging, when an API process cannot start', async () => {
    const appOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = 'not a url'; // inherited by both API processes, which then exit
    try {
      await expect(runDuplicateProof()).rejects.toThrow(/exited early/);
    } finally {
      if (appOrigin === undefined) delete process.env.APP_ORIGIN;
      else process.env.APP_ORIGIN = appOrigin;
    }
  }, 30_000);
});
