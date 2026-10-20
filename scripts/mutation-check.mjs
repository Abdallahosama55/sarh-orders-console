// `npm run qa:mutants [-- --e2e]` — removes one safeguard at a time and checks that the tests
// notice. A mutant is "killed" when its test run fails. Every file is restored afterwards, even
// on Ctrl+C. Takes ~2 minutes (plus ~20 s with --e2e).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const api = (file) => ['npx', 'vitest', 'run', '--project', 'api', file];
const web = (file) => ['npx', 'vitest', 'run', '--project', 'web', file];

// [id, what the mutant breaks, edits [file, from, to][], test command, expected ('kill' by default)]
// prettier-ignore
const MUTANTS = [
  ['A1', 'decode the JWT instead of verifying it (the inherited bug)', [['apps/api/src/auth/session-token.ts', 'payload = jwt.verify(token, secret, {', 'payload = jwt.decode(token); ({']], api('test/auth.test.ts')],
  ['A2', 'ignore token_version (no revocation)', [['apps/api/src/auth/auth.middleware.ts', 'user.tokenVersion !== result.claims.tokenVersion', 'false']], api('test/auth.test.ts')],
  ['A3', 'no server-side role check on delete', [['apps/api/src/orders/orders.router.ts', "router.delete('/:id', requireRole('admin'), (req, res)", "router.delete('/:id', (req, res)"]], api('test/auth.test.ts')],
  ['A4', 'login body not validated (operator injection)', [['apps/api/src/auth/auth.router.ts', 'parseOrThrow(loginInputSchema, req.body)', '(req.body as { email: string; password: string })']], api('test/auth.test.ts')],
  ['A5', 'origin check disabled (CSRF)', [['apps/api/src/http/origin-check.ts', 'allowedOrigins.includes(origin)', 'true']], api('test/auth.test.ts')],
  ['A6', 'rate limit too generous', [['apps/api/src/auth/login-rate-limit.ts', 'limit: MAX_FAILED_ATTEMPTS,', 'limit: 1000,']], api('test/auth.test.ts')],
  ['A7', 'replay regardless of payload', [['apps/api/src/orders/orders.repository.ts', 'existing.request_fingerprint === order.fingerprint', 'true']], api('test/orders-create.test.ts')],
  ['A8', 'idempotency key consumed before validation', [['apps/api/src/orders/orders.router.ts', 'const input = parseOrThrow(createOrderInputSchema, req.body);', 'const input = req.body as never;']], api('test/orders-create.test.ts')],
  ['A9', 'unique index removed from the schema', [['apps/api/src/db/migrations/001_initial.sql', '  UNIQUE (created_by, idempotency_key),\n', '']], api('test/orders-create.test.ts')],
  ['A10', 'inclusive keyset comparison', [['apps/api/src/orders/orders.repository.ts', "page.dir === 'asc' ? '>' : '<'", "page.dir === 'asc' ? '>=' : '<='"]], api('test/orders-list.test.ts')],
  ['A11', 'no id tie-breaker in ORDER BY', [['apps/api/src/orders/orders.repository.ts', 'ORDER BY ${column} ${direction}, o.id ${direction}', 'ORDER BY ${column} ${direction}']], api('test/orders-list.test.ts')],
  ['A12', 'LIKE wildcards not escaped', [['apps/api/src/orders/orders.repository.ts', "params.like = `%${q.replace(/[\\\\%_]/g, '\\\\$&')}%`;", 'params.like = `%${q}%`;']], api('test/orders-list.test.ts')],
  ['A13', 'count not capped (expected to survive: same output, unbounded cost, see `npm run bench`)', [['apps/api/src/orders/orders.repository.ts', 'LIMIT ${COUNT_CAP + 1})', ')']], api('test/orders-list.test.ts'), 'survive'],
  ['A14', 'stats work continues after the client leaves', [['apps/api/src/orders/orders.router.ts', 'waitForSlowReport(delayMs, abortSignalFor(res))', 'waitForSlowReport(delayMs, new AbortController().signal)']], api('test/orders-stats.test.ts')],
  ['A15', 'order detail shows soft-deleted orders', [['apps/api/src/orders/orders.repository.ts', 'WHERE o.id = ? AND o.deleted_at IS NULL', 'WHERE o.id = ?']], api('test/auth.test.ts')],
  ['A16', 'a bare number hides name and email matches', [['apps/api/src/orders/orders.repository.ts', "where.push(orderNumber ? `(o.id = @orderNumber OR ${text})` : text);", "where.push(orderNumber ? 'o.id = @orderNumber' : text);"]], api('test/orders-list.test.ts')],
  ['A17', 'a failed cold start is cached for the life of the instance', [['apps/api/src/vercel-handler.ts', 'if (app === starting) app = undefined;', 'void starting;']], api('test/vercel-handler.test.ts')],
  ['A18', 'control characters decoded into the log line (log forging)', [['apps/api/src/http/request-logger.ts', 'const query = decodeURIComponent(params.toString()).replace(CONTROL_CHARACTERS, (character) =>\n    encodeURIComponent(character),\n  );', 'const query = decodeURIComponent(params.toString());']], api('src/http/request-logger.test.ts')],
  ['W1', 'list request ignores its AbortSignal', [['apps/web/src/orders/use-orders-list.ts', 'listOrders({ ...filters, cursor: pageParam }, signal)', 'listOrders({ ...filters, cursor: pageParam })']], web('src/orders/OrdersPage.race.test.tsx')],
  ['W2', "keep the previous filter's rows while loading", [['apps/web/src/orders/use-orders-list.ts', 'initialPageParam: null as string | null,', 'initialPageParam: null as string | null,\n    placeholderData: (previous) => previous,']], web('src/orders/OrdersPage.race.test.tsx')],
  ['W3', 'cache key ignores the filters', [['apps/web/src/orders/use-orders-list.ts', 'queryKey: orderKeys.list(filters),', 'queryKey: orderKeys.lists(),']], web('src/orders')],
  ['W4', 'no synchronous double-submit guard', [['apps/web/src/create-order/CreateOrderPage.tsx', 'if (inFlight.current) return;', '']], web('src/create-order/CreateOrderPage.test.tsx')],
  ['W5', 'new Idempotency-Key per submit', [['apps/web/src/create-order/CreateOrderPage.tsx', 'idempotencyKey: draft.currentKey(),', 'idempotencyKey: crypto.randomUUID(),']], web('src/create-order/CreateOrderPage.test.tsx')],
  ['W6', 'draft and key not persisted', [['apps/web/src/create-order/order-draft.ts', "writeStored('session', STORAGE_KEY, JSON.stringify({ idempotencyKey: key.current, values }))", 'void values']], web('src/create-order/CreateOrderPage.test.tsx')],
  ['W7', 'create never retries network failures', [['apps/web/src/create-order/use-create-order.ts', 'failureCount < MAX_AUTOMATIC_RETRIES && isRetryableError(error)', 'false']], web('src/create-order/CreateOrderPage.test.tsx')],
  ['W8', 'stats silently auto-retries', [['apps/web/src/stats/use-order-stats.ts', 'retry: false,', '']], web('src/stats/StatsPage.test.tsx')],
  ['W9', 'stats request not cancelled on leave', [['apps/web/src/stats/use-order-stats.ts', 'getOrderStats(signal)', 'getOrderStats()']], web('src/stats/StatsPage.test.tsx')],
  ['W10', 'search not debounced', [['apps/web/src/orders/OrdersPage.tsx', 'const SEARCH_DEBOUNCE_MS = 300;', 'const SEARCH_DEBOUNCE_MS = 0;']], web('src/orders/OrdersPage.test.tsx')],
  ['W11', 'admin controls shown to agents', [['apps/web/src/auth/AdminOnly.tsx', "useCurrentUser().role === 'admin' ? children : null", 'children']], web('src/orders/OrdersPage.test.tsx')],
  ['W12', 'open redirect through ?next=', [['apps/web/src/auth/session.ts', 'if (url.origin !== window.location.origin) return DEFAULT_NEXT_PATH;', 'return next;']], web('src/auth')],
  ['W13', 'a 401 does not end the session', [['apps/web/src/app/query-client.ts', 'if (error instanceof ApiError && error.status === 401) client.setQueryData(sessionKey, null);', 'void error;']], web('src/orders/OrdersPage.test.tsx')],
  ['W14', 'the draft saves a stale key ("Create another order", then reload)', [['apps/web/src/create-order/order-draft.ts', 'JSON.stringify({ idempotencyKey: key.current, values })', 'JSON.stringify({ idempotencyKey: initial.idempotencyKey, values })']], web('src/create-order/CreateOrderPage.test.tsx')],
  ['W15', 'body read outside the network-error mapping', [['apps/web/src/lib/api-client.ts', '    // The body can fail after the headers arrived: a dropped connection, or our timeout.\n    payload = await readJson(response);\n', ''], ['apps/web/src/lib/api-client.ts', '  if (!response.ok) throw toApiError(response.status, payload);', '  payload = await readJson(response);\n  if (!response.ok) throw toApiError(response.status, payload);']], web('src/lib/api-client.test.ts')],
  ['W16', 'drawer parses ids with Number() ("1e3" opens order 1000)', [['apps/web/src/orders/OrderDrawer.tsx', 'const id = parseOrderId(orderId);', 'const id = Number(orderId) || null;']], web('src/orders/OrdersPage.test.tsx')],
  ['W17', 'pages read the session query, not the user <RequireAuth> let through', [['apps/web/src/auth/session.ts', 'const user = useContext(CurrentUserContext);', 'const user = useSession().data;']], web('src/auth/auth-flow.test.tsx')],
];

// prettier-ignore
const E2E_MUTANTS = [
  ['E1', 'RouterProvider without flushSync support (dropped keystrokes)', [['apps/web/src/main.tsx', "import { createBrowserRouter } from 'react-router';\nimport { RouterProvider } from 'react-router/dom';", "import { createBrowserRouter, RouterProvider } from 'react-router';"]], ['npx', 'playwright', 'test', '--project=e2e', 'e2e/orders-list.spec.ts', '-g', 'typing fast']],
];

const mutants = process.argv.includes('--e2e') ? [...MUTANTS, ...E2E_MUTANTS] : MUTANTS;
const originals = new Map();
const restore = () => {
  for (const [file, content] of originals) writeFileSync(file, content);
  originals.clear();
};
process.on('SIGINT', () => {
  restore();
  process.exit(130);
});

let unexpected = 0;
for (const [id, what, edits, command, expected = 'kill'] of mutants) {
  try {
    for (const [file, from, to] of edits) {
      const current = readFileSync(file, 'utf8');
      if (current.split(from).length !== 2)
        throw new Error(`${id}: pattern not found exactly once in ${file}`);
      if (!originals.has(file)) originals.set(file, current);
      writeFileSync(file, current.replace(from, to));
    }
    const run = spawnSync(command[0], command.slice(1), { encoding: 'utf8' });
    const killed = run.status !== 0;
    const asExpected = (expected === 'kill') === killed;
    if (!asExpected) unexpected += 1;
    console.log(
      `${asExpected ? '✔' : '✘'} ${id.padEnd(4)} ${killed ? 'KILLED  ' : 'SURVIVED'} ${what}`,
    );
  } finally {
    restore();
  }
}
console.log(
  unexpected === 0
    ? '\nEvery mutant behaved as expected.'
    : `\n${unexpected} mutant(s) did not behave as expected.`,
);
process.exitCode = unexpected === 0 ? 0 : 1;
