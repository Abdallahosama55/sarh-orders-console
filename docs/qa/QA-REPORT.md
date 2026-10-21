# QA report: Orders Console

|                 |                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**        | 19 Oct 2026; review pass (Q17–Q28) 21 Oct 2026                                                                                                       |
| **Scope**       | All requirements in [`../specs/01-requirements.md`](../specs/01-requirements.md), tested per [`TEST-PLAN.md`](TEST-PLAN.md)                          |
| **Environment** | macOS 26.5 (Apple M4) · Node 22.17.1 · npm 10.9.2 (installs also checked on npm 11.21.1 and 12.2.1) · SQLite 3.53.2 · Chromium via Playwright 1.63.0 |
| **Verdict**     | **Ready to submit.** Every exit criterion is met. Residual risks are listed in §8.                                                                   |

## 1. Results

| Check                                                | Command                                                                                       | Result                                                                                                                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types, lint, format, all Vitest tests                | `npm run verify`                                                                              | Pass                                                                                                                                                                                                                |
| Unit, API integration, multi-process, component      | `npm test`                                                                                    | **242 / 242** passed in 25 files, ~7 s                                                                                                                                                                              |
| End-to-end (Chromium, real API, 50k rows)            | `npm run test:e2e`                                                                            | **18 / 18**; **54 / 54** with `--repeat-each=3` (no flakes)                                                                                                                                                         |
| R2 duplicate proof (two API processes, one DB)       | `npm run proof:duplicates`                                                                    | **PASS**: 1 order per key in all 3 scenarios; 2 rows for 2 keys                                                                                                                                                     |
| Mutation checks                                      | `npm run qa:mutants -- --e2e`                                                                 | **35 killed, 1 survived as declared** (§4), 98 s                                                                                                                                                                    |
| Performance at 50,000 rows                           | `npm run bench`                                                                               | worst p95 **17.9 ms** (target < 50 ms)                                                                                                                                                                              |
| Seed determinism                                     | `seed.test` + a full 50k double-seed SHA-256 check                                            | identical (`27c9de2a…`)                                                                                                                                                                                             |
| Dependencies                                         | `npm audit`                                                                                   | **0 vulnerabilities** (after Q14)                                                                                                                                                                                   |
| Fresh clone, empty npm cache                         | `git clone` → `npm install` → `npm run setup` → `npm test`                                    | **25 s** in total (15 s + 3 s + 7 s)                                                                                                                                                                                |
| Install with pnpm 11.22 and 10.34                    | `pnpm install` → `npm run setup` → `npm run verify` → `npm run test:e2e`                      | Pass (226 tests, 18 E2E); also over an npm-created `node_modules`                                                                                                                                                   |
| CI on GitHub Actions (Ubuntu)                        | `.github/workflows/ci.yml` on push                                                            | Pass on the first run: `npm ci` 8 s · `verify` 35 s · Playwright install 20 s · E2E 38 s (110 s in total)                                                                                                           |
| Vercel demo deployment                               | `vercel deploy --prod`, then curl + Playwright against https://sarh-orders-console.vercel.app | Login, 50k list, rapid filter, Arabic search, create, stats; no console errors. Cold start seeds 50k in ~2.6 s. Sequential retries replay, but a parallel burst reached two instances (see §8)                      |
| Production bundle in a browser                       | `npm run build` + `vite preview` + Playwright                                                 | Renders, signs in, filters, lossless typing; chunks 34 / 200 / 316 kB                                                                                                                                               |
| Code review (`code-review` plugin)                   | `/code-review` at high effort over `apps`, `packages`, `scripts` and `e2e`                    | **10 findings, all confirmed against the code and fixed**, each with a test that failed first (Q17–Q26)                                                                                                             |
| TypeScript language server (`typescript-lsp` plugin) | `typescript-language-server` 6.0.2 on the repo's TypeScript 5.9, every tracked TS/JS file     | **0 errors, 0 warnings, 0 suggestions** in 115 files: no deprecated API (TS6385), useless `await` (TS80007) or unused code. A planted file with all three proved the harness reports them                           |
| Library usage against current docs (Context7)        | Context7 docs for 11 libraries, compared with each call site                                  | No deprecated or misused API. Adopted React Query's `skipToken`. TanStack Virtual's React 19 `flushSync` warning did not occur in a browser probe (fast scrolling, paging, filtering, drawer), so the default stays |
| Secrets                                              | `git ls-files`                                                                                | only `.env.example`; `.env` and `data/*.db` are ignored                                                                                                                                                             |

## 2. Defects found by QA and fixed

Each fix is its own commit, so the history shows what testing caught. Q17–Q26 come from a code review of the finished code with the `code-review` plugin; each finding was checked against the code, reproduced by a failing test, then fixed. Q27 and Q28 are what CI caught on the push of those fixes.

| ID      | Found by                        | Symptom                                                                                                                                                                                              | Root cause → fix                                                                                                                                                                                                                                                                                           | Commit               |
| ------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Q1      | first install                   | `npm install` crashed: "Cannot read properties of null (reading 'edgesOut')"                                                                                                                         | npm 10.9's arborist crashes resolving vitest 4.1's peer set without a lockfile → pinned 4.0, later upgraded with an npm-11 lockfile that npm 10 installs from cleanly                                                                                                                                      | `cf809ff`, `fa504bb` |
| Q2      | install warning                 | `@testing-library/jest-dom@6.10.0` deprecated as a breaking minor                                                                                                                                    | pinned 6.9.1                                                                                                                                                                                                                                                                                               | `cf809ff`            |
| Q3      | mutation A11 survived           | Dropping the `id` tie-breaker went unnoticed                                                                                                                                                         | Index scans return ties in id order anyway; search results are sorted in memory, where they don't → paging oracle tests for searches whose matches share a timestamp                                                                                                                                       | `dc3549e`            |
| Q4      | component tests                 | Error text became part of the inputs' accessible names ("Customer emailThis address bounces")                                                                                                        | errors lived inside `<label>` → `Field` component linking errors with `aria-describedby` and `aria-invalid`                                                                                                                                                                                                | `54229c8`            |
| Q5      | mutation W4 survived            | Removing the double-submit guard went unnoticed                                                                                                                                                      | user-event lets React re-render between clicks → a test dispatching two synchronous submits                                                                                                                                                                                                                | `54229c8`            |
| Q6      | unit test                       | Create timeout reported as "Could not reach the server"                                                                                                                                              | `instanceof DOMException` fails across realms → check whether our own timeout signal fired                                                                                                                                                                                                                 | `54229c8`            |
| Q7      | component test                  | Stats retry looked identical to the error, and a failed refresh hid the last numbers                                                                                                                 | → keep the data, show an error banner with Retry                                                                                                                                                                                                                                                           | `54229c8`            |
| **Q8**  | **browser walkthrough**         | **Fast typing dropped characters**: "mohammed.alharbi" became "mhammed.alhari" at 10 ms/key, and just "i" with a busy main thread                                                                    | URL-controlled input updated through a router _transition_; `flushSync` was silently ignored by `RouterProvider` from `react-router` → filter navigations use `flushSync` and `RouterProvider` comes from `react-router/dom`. jsdom cannot reproduce this; the E2E test fails without the fix (mutant E1). | `6ab7b97`            |
| Q9      | browser walkthrough             | Status chip briefly showed the previous selection                                                                                                                                                    | same root cause as Q8                                                                                                                                                                                                                                                                                      | `6ab7b97`            |
| Q10     | screenshot review               | Arabic names right-aligned away from their emails; quotes reversed around Arabic search text                                                                                                         | `dir="auto"` on block-level cells → `<bdi>`                                                                                                                                                                                                                                                                | `5e9e810`            |
| **Q11** | **production build check**      | **Blank page in the production build only**: "Cannot read properties of undefined (reading 'createContext')"                                                                                         | Vendor split by entry names put `react/jsx-runtime` in another chunk → circular chunk imports → split by file path                                                                                                                                                                                         | `750d349`            |
| **Q12** | mutation experiment             | With the unique index replaced by a naive check-then-insert, the parallel proof **still passed 3/3**                                                                                                 | Microsecond race window: a passing race test is evidence, not proof → the schema is tested directly (a second row for the same user and key is rejected; key-less API orders are rejected)                                                                                                                 | `2e6d38a`            |
| Q13     | `--repeat-each=3`               | The admin delete test failed on repeats                                                                                                                                                              | It deleted a fixed order id → the test now creates the order it deletes                                                                                                                                                                                                                                    | `5668953`            |
| Q14     | `npm audit`                     | 1 moderate and 1 critical, dev-only (vitest, GHSA-82fw-gwwq-j7x9)                                                                                                                                    | upgraded to vitest 4.1.12 (see Q1)                                                                                                                                                                                                                                                                         | `fa504bb`            |
| Q15     | npm 11 install                  | "install scripts not yet covered by allowScripts: better-sqlite3", which could block the native binding in future npm versions                                                                       | `allowScripts` in `package.json` (msw explicitly denied)                                                                                                                                                                                                                                                   | `fa504bb`            |
| Q16     | the user running `pnpm install` | `npm run setup` failed: `tsx: command not found`                                                                                                                                                     | pnpm ignores the `workspaces` field (only root deps were installed) and blocks dependency build scripts (no better-sqlite3 binding) → `pnpm-workspace.yaml` with `linkWorkspacePackages` and build approvals for pnpm 10 and 11                                                                            | `pnpm` commit        |
| **Q17** | **code review**                 | **After "Create another order", a reload before typing restored the spent Idempotency-Key**: the next order would replay the previous one (same body) or get a 422                                   | react-hook-form's `reset()` notifies subscribers synchronously, so the autosave ran with the previous render's key → the key lives in a ref swapped in the same event                                                                                                                                      | `e12c687`            |
| Q18     | code review                     | A failed Vercel cold start was cached: every later request on that instance hung. A seed that died halfway left a file the next start took for a full database                                       | The failure is answered with a 503 and forgotten; the seed writes a side file that is renamed once complete                                                                                                                                                                                                | `1532400`            |
| Q19     | code review                     | `npm run proof:duplicates` hung when an API process could not start                                                                                                                                  | Cleanup waited for an `exit` event that had already fired → exited processes are skipped, and `signalCode` is checked too                                                                                                                                                                                  | `fb837ef`            |
| Q20     | code review                     | Searching "357" found order #357 but none of the customers whose email contains 357 (70% of seeded emails carry digits)                                                                              | `#357` = order number only; a bare `357` = order number or name/email, a `MULTI-INDEX OR` (0.11 ms at 50k)                                                                                                                                                                                                 | `5b9ceb1`            |
| Q21     | code review                     | `%0A` in a non-redacted query parameter became a newline in the text log: forged log lines                                                                                                           | Control characters are re-encoded after decoding                                                                                                                                                                                                                                                           | `bdba2bb`            |
| Q22     | code review                     | A connection dropping mid-body surfaced as a raw `TypeError`: no automatic same-key retry, and a generic message                                                                                     | The body is read inside the same error mapping as `fetch`                                                                                                                                                                                                                                                  | `7211b0c`            |
| Q23     | code review                     | `/login?next=/%09/evil.example` passed the redirect filter: the URL parser drops the tab, leaving `//evil.example`                                                                                   | `next` is resolved against the origin, origins are compared, and the normalised path is returned                                                                                                                                                                                                           | `c6789d2`            |
| Q24     | code review                     | `/orders/1e3` opened order #1000 (`Number()` accepts `1e3` and `0x10`)                                                                                                                               | A shared `parseOrderId` with the API's rule, used on both sides; the drawer skips the request with `skipToken`                                                                                                                                                                                             | `65b68f3`            |
| Q25     | code review                     | "Order #42 was deleted." came back after a reload or Back                                                                                                                                            | The message moved from history state to component state, reported by the drawer through `useOutletContext`                                                                                                                                                                                                 | `f1a57bf`            |
| Q26     | code review                     | The client restated the page size (50)                                                                                                                                                               | Imported from `@orders/shared`                                                                                                                                                                                                                                                                             | `97eb8f2`            |
| **Q27** | **CI (GitHub Actions)**         | **All 241 tests passed, but Vitest caught an unhandled error on sign-out**: "useCurrentUser() must be rendered inside <RequireAuth>". Timing-dependent: it never failed locally, even under CPU load | A page below `<RequireAuth>` re-rendered (logout settling, navigation starting) after the session ended and before the redirect, and read the ended session → `<RequireAuth>` provides the user through context. A test holds the `/login` navigation with a loader, forcing the ordering                  | `315f43b`            |
| Q28     | CI re-run                       | "lets an admin delete" found the drawer still open right after the message appeared                                                                                                                  | Since Q25 the message (list state) and the drawer closing (a navigation) are two updates, and the navigation can land later → the test waits for it                                                                                                                                                        | `870f0d4`            |

## 3. What the R2 proof shows

`npm run proof:duplicates` starts two API **processes** on one fresh database file and reads the counts from the file itself. Typical output:

```
1) Same request twice in parallel, one to each process
   A → 201  order #1
   B → 201  order #1  (Idempotent-Replayed: true)
   orders with this key in the database: 1  ✔
2) Retry storm: 20 identical requests split across both processes
   20 responses · status 201 · distinct order ids: 1 (#2) · replays: 19
   orders with this key in the database: 1  ✔
3) Same key, edited items (agent changed the draft after an unknown outcome)
   B → 422 idempotency_key_reused  order #1
   orders with this key in the database: 1  ✔
orders table: 2 rows for 2 distinct keys  ✔
```

The browser-level counterpart runs in E2E. The response is dropped _after_ the server committed the order (`route.fetch()` then `abort`), the client retries with the same key, the UI shows the original order, and the API holds exactly one order for that email. A double-click and a reload mid-submit are tested the same way.

## 4. Mutation checks (`npm run qa:mutants -- --e2e`)

Each row removes one safeguard; the named tests must then fail.

|     | Mutant                                                                 | Result                                                                          |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A1  | decode the JWT instead of verifying it (the inherited bug)             | killed                                                                          |
| A2  | ignore `token_version` (no revocation)                                 | killed                                                                          |
| A3  | no server-side role check on delete                                    | killed                                                                          |
| A4  | login body not validated (operator injection)                          | killed                                                                          |
| A5  | origin check disabled (CSRF)                                           | killed                                                                          |
| A6  | rate limit too generous                                                | killed                                                                          |
| A7  | replay regardless of payload                                           | killed                                                                          |
| A8  | idempotency key consumed before validation                             | killed                                                                          |
| A9  | unique index removed from the schema                                   | killed                                                                          |
| A10 | inclusive keyset comparison                                            | killed                                                                          |
| A11 | no `id` tie-breaker in `ORDER BY`                                      | killed (after Q3)                                                               |
| A12 | `LIKE` wildcards not escaped                                           | killed                                                                          |
| A13 | count not capped                                                       | **survives by design**: same output, unbounded cost; covered by `npm run bench` |
| A14 | stats work continues after the client leaves                           | killed                                                                          |
| A15 | order detail shows soft-deleted orders                                 | killed                                                                          |
| A16 | a bare number hides name and email matches                             | killed (after Q20)                                                              |
| A17 | a failed cold start is cached for the life of the instance             | killed (after Q18)                                                              |
| A18 | control characters decoded into the log line (log forging)             | killed (after Q21)                                                              |
| W1  | list request ignores its `AbortSignal`                                 | killed                                                                          |
| W2  | keep the previous filter's rows while loading                          | killed                                                                          |
| W3  | cache key ignores the filters                                          | killed                                                                          |
| W4  | no synchronous double-submit guard                                     | killed (after Q5)                                                               |
| W5  | new Idempotency-Key per submit                                         | killed                                                                          |
| W6  | draft and key not persisted                                            | killed                                                                          |
| W7  | create never retries network failures                                  | killed                                                                          |
| W8  | stats silently auto-retries                                            | killed                                                                          |
| W9  | stats request not cancelled on leave                                   | killed                                                                          |
| W10 | search not debounced                                                   | killed                                                                          |
| W11 | admin controls shown to agents                                         | killed                                                                          |
| W12 | open redirect through `?next=`                                         | killed                                                                          |
| W13 | a 401 does not end the session                                         | killed                                                                          |
| W14 | the draft saves a stale key ("Create another order", then reload)      | killed (after Q17)                                                              |
| W15 | body read outside the network-error mapping                            | killed (after Q22)                                                              |
| W16 | drawer parses ids with `Number()` (`1e3` opens order 1000)             | killed (after Q24)                                                              |
| W17 | pages read the session query, not the user `<RequireAuth>` let through | killed (after Q27)                                                              |
| E1  | `RouterProvider` without `flushSync` support (dropped keystrokes)      | killed (only by E2E)                                                            |

## 5. Performance

`npm run bench`: 50,000 orders, 200 runs per query after 10 warm-up runs, times in ms. Laptop: Apple M4, macOS 26.5.

| Query                                        |   p50 |       p95 |   max |
| -------------------------------------------- | ----: | --------: | ----: |
| Default view: newest first                   |  0.06 |      0.06 |  0.44 |
| Status = shipped, amount high → low          |  0.06 |      0.07 |  0.16 |
| Status = pending (rare), oldest first        |  0.06 |      0.06 |  0.14 |
| Deep page: row 40,000 by keyset cursor       |  0.06 |      0.06 |  0.14 |
| Search: one customer's full email            |  1.28 |      1.34 |  1.45 |
| Search: "harbi" (common surname)             |  0.92 |      0.94 |  1.09 |
| Search: "example.com" (matches every row)    | 17.59 | **17.91** | 29.51 |
| Search: "al" (2 chars, `LIKE` fallback)      |  0.07 |      0.07 |  0.17 |
| Search: "zq" (2 chars, no match → full scan) |  7.71 |      8.78 | 17.22 |
| Search: order number "#25000"                |  0.01 |      0.01 |  0.01 |
| Search "harbi" + status cancelled + amount   |  0.47 |      0.49 |  0.63 |
| Count: all orders (capped at 10,000)         |  0.21 |      0.22 |  0.24 |
| Count: status = cancelled                    |  0.97 |      1.00 |  1.09 |
| Count: search "harbi"                        |  0.38 |      0.44 |  0.49 |
| Stats: totals by status + revenue today      | 10.46 |     11.06 | 14.62 |
| _`OFFSET 40,000` (the rejected alternative)_ |  3.73 |      4.55 |  5.59 |

Plans: every non-search shape is a `SEARCH`/`SCAN … USING INDEX orders_*_idx` with no sort step, which an automated test asserts. Trigram searches drive from `orders_search` and sort their matches; that is the 18 ms worst case, which [SCALE.md](../../SCALE.md) addresses for 5M rows. Seeding 50,000 orders takes 2.1 s.

## 6. Security verification

- **Every code-review finding has a failing-without-fix test** (mutants A1–A6, W11–W13 plus the tests in [`TEST-PLAN.md`](TEST-PLAN.md#6-traceability-matrix)): forged-secret, `alg:none`, wrong-audience, expired, revoked and query-string tokens all get `401`; operator injection gets `400`; an agent `DELETE` gets `403`; a foreign `Origin` gets `403`; the 11th failed login gets `429`.
- **In a real browser:** the session cookie is `httpOnly`, `SameSite=Strict`, `Path=/api`, and `document.cookie` cannot see it. Logout invalidates every copy of the token.
- **Password storage:** only `scrypt$32768$8$1$…` hashes are in the database; an unknown email and a wrong password get identical responses.
- **No PII in logs:** search terms are redacted (`q=<redacted>`) and cursors shortened.
- `npm audit`: 0 vulnerabilities. Only `.env.example` is committed.

## 7. Exploratory browser QA

Scripted Playwright walkthroughs (screenshots reviewed by eye) of the dev server and the production build:

- signed-out deep link → login → back to `/orders?status=paid`, in 0.3 s
- 618 paid, "10,000+" for all; after scrolling 15,000 px, still only 38 row elements in the DOM
- `العتيبي` → 288 matches; `#4242` → 1
- order panel: Esc closes it and keeps the filters; an admin delete removes the order from search
- create order with two items: total SAR 376.00 shown live; a double-click created exactly one order (checked in the database)
- stats: skeleton plus elapsed counter, data after 3–6 s; leaving early is aborted in the browser and skipped on the server
- console: the only entry is the expected `401` from the session probe while signed out

## 8. Residual risks and what was not tested

- **Chromium only.** No Firefox or WebKit runs. Nothing browser-specific is used beyond `AbortSignal.any` (supported by all current browsers).
- **The Vercel demo has no shared database.** Each serverless instance seeds its own SQLite copy, and two parallel identical creates were observed creating one order in each of two copies. R2 across concurrent requests is therefore proven locally and in CI (`npm run proof:duplicates`, the two-process test), not on the demo URL.
- **No automated accessibility audit** (axe). Accessibility is covered only through role- and label-based queries, `aria-sort`, `aria-live` and `aria-invalid` assertions.
- **No multi-user load test.** The benchmark measures single-query latency; the API is one process with a synchronous SQLite driver (see SCALE.md).
- **jsdom cannot reproduce input-timing races** (Q8). They are covered by E2E only.
- **Business-level duplicates** (two separate drafts of the same order) are out of scope by design; see DECISIONS.md.

## 9. Reproduce

```bash
npm install && npm run setup
npm run verify                    # types, lint, format, 226 tests
npx playwright install chromium   # once
npm run test:e2e                  # 18 journeys
npm run proof:duplicates          # R2 proof
npm run bench                     # performance table
npm run qa:mutants -- --e2e       # mutation checks (~95 s)
```
