// `npm run proof:duplicates` — R2-9: fires the same create request in parallel at two API
// processes sharing one database and shows that exactly one order exists. Exits 1 on failure.
import { runDuplicateProof } from '../proof/duplicate-proof';

console.log('R2 proof · identical create requests in parallel against two API processes\n');
const result = await runDuplicateProof((line) => console.log(line));
console.log(
  result.passed
    ? '\nPASS: every Idempotency-Key produced exactly one order.'
    : '\nFAIL: a key produced more than one order, or a response was wrong.',
);
process.exitCode = result.passed ? 0 : 1;
