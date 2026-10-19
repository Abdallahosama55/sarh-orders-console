# 03 · Tasks — Orders Console

The build plan for [`02-design.md`](02-design.md). Each task lists the requirements it satisfies and is done only when its tests pass. Status: ☐ todo · ◐ in progress · ☑ done.

| ID   | Task                                                                                                                                           | Requirements                 | Design § | Status |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------- | ------ |
| T-01 | Scaffold npm workspaces, strict TypeScript, ESLint, Prettier, Vitest projects                                                                  | NFR-3, NFR-4                 | 1–2      | ☑      |
| T-02 | Shared contracts: statuses, list query, create-order and login schemas, money helpers, API error codes, plus unit tests                        | R2-2, A-1, A-2               | 1, 9     | ☑      |
| T-03 | Config (zod env, fail-fast secret), SQLite connection, migration `001_initial.sql` (tables, indexes, FTS5 trigram + triggers)                  | SEC-2, R1-7                  | 3        | ☑      |
| T-04 | Deterministic seed (50k orders, 1–5 items, 1 admin + 2 agents) and `npm run setup` (generates `.env` secret)                                   | R1-12, SEC-12, NFR-1         | 3        | ☑      |
| T-05 | HTTP plumbing: `HttpError`, central error handler, request logger (PII-safe), origin check, dev latency                                        | SEC-3, SEC-11, NFR-6         | 7, 9     | ☑      |
| T-06 | Auth: scrypt passwords, JWT verify/sign, cookie session, `requireAuth`/`requireRole`, login rate limit, logout revocation, plus security tests | SEC-1…SEC-10                 | 7        | ☑      |
| T-07 | Orders list: query builder, keyset cursor, search strategy, capped count, plus exhaustive paging and plan tests                                | R1-2…R1-5, R1-7, R1-10       | 5.1      | ☑      |
| T-08 | Order detail + admin soft delete                                                                                                               | R1-11, SEC-6, A-7            | 4, 7     | ☑      |
| T-09 | Idempotent create (fingerprint, transaction, replay/422/409), plus parallel tests                                                              | R2-2…R2-7                    | 6.1      | ☑      |
| T-10 | Slow stats endpoint with server-side cancellation                                                                                              | O1-1, O1-3                   | 8        | ☑      |
| T-11 | Web shell: API client, query client, router, session/login, `RequireAuth`, `AdminOnly`, layout                                                 | SEC-5 (UX), SEC-6 (UX)       | 1        | ☑      |
| T-12 | Orders page: URL filters, toolbar, virtualised infinite table, states, detail drawer, admin delete                                             | R1-1…R1-11                   | 5.2–5.3  | ☑      |
| T-13 | Latest-wins component tests (out-of-order MSW + key-isolation test)                                                                            | R1-8                         | 5.2      | ☑      |
| T-14 | Create-order page: shared-schema form, live total, draft + key persistence, retrying mutation, error UX, plus tests                            | R2-1, R2-2, R2-3, R2-8       | 6.2      | ☑      |
| T-15 | Stats page: non-blocking loading, elapsed timer, abort on leave, error + single Retry, plus tests                                              | O1-2, O1-3, O1-4             | 8        | ☑      |
| T-16 | DEV toolbar (latency / failure toggles), excluded from production builds                                                                       | R1-8 (manual), O1-4 (manual) | 9        | ☑      |
| T-17 | `npm run proof:duplicates` (two processes, DB count) and `npm run bench` (p50/p95 + plans)                                                     | R2-9, NFR-2                  | 6.1, 10  | ☑      |
| T-18 | Playwright E2E: auth/roles, rapid filter, scroll paging, double-click and lost-response create, stats cancel/retry, screenshots                | R1-8, R2-8, O1-3, O1-4       | 10       | ☑      |
| T-19 | README (setup, review findings, token storage, product question, skipped), DECISIONS.md, SCALE.md                                              | brief §3, §5, §7             | –        | ☑      |
| T-20 | QA: test plan + traceability, full run, fresh-clone check, QA report                                                                           | all                          | 10       | ☑      |
| T-21 | Added during QA: mutation harness `npm run qa:mutants` (28 safeguards removed one at a time)                                                   | all P0                       | 10       | ☑      |
| T-22 | Added during QA: fixes for defects Q1–Q15 (see QA report §2)                                                                                   | R1-2, R1-8, R2-4, NFR-1      | –        | ☑      |

All tasks were completed on 19 Oct 2026. Results are in [`../qa/QA-REPORT.md`](../qa/QA-REPORT.md).
