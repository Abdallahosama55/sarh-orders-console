# DECISIONS

Three decisions, each with the alternative that was seriously weighed and why it lost. The design behind them is in [`docs/specs/02-design.md`](docs/specs/02-design.md), and the evidence is in [`docs/qa/QA-REPORT.md`](docs/qa/QA-REPORT.md).

## How AI tools were used

This repository was built in a pair-programming session with **Claude Code (Claude Opus 5.5)**. It wrote the spec documents first, then most of the implementation and tests. It ran the QA loop: Vitest, Playwright, mutation checks, benchmarks, and browser walkthroughs of the dev server and the production build. It also drafted these documents. Every number in the QA report comes from a command that was actually run, and the commit history keeps the bugs QA found and how each was fixed.

<!-- Candidate: add a sentence or two on what you reviewed, changed or decided yourself before submitting. -->

---

## 1 · R2: the database decides what "the same order" is

**Decision.** Each draft gets a UUID `Idempotency-Key`, stored on the order row under `UNIQUE (created_by, idempotency_key)`. The create is one `INSERT … ON CONFLICT DO NOTHING` in a `BEGIN IMMEDIATE` transaction. Same key and same body replays the original order; same key with a different body gets `422`. The client keeps the key with the draft in `sessionStorage`, so retries, double-clicks and reloads all reuse it.
**Alternative.** A separate `idempotency_keys` table with stored responses and an "in progress" state (Stripe's model). It is generic, and keys can expire.
**Why rejected.** Only one endpoint needs it. A second table is a second row that must agree with the order, and "in progress" needs timeouts and crash recovery. On the order row, the guarantee is a single unique index that holds across processes; `npm run proof:duplicates` races two API processes on one database file to show it.

**Limits.**

- It covers retries of one submission, not two separate drafts of the same real-world order (two agents, or one agent retyping). What counts as a business duplicate is a product rule; open question Q-2 proposes a soft "possible duplicate" warning.
- Clearing site data, or opening the form in a second tab, starts a new draft with a new key.
- If an admin deletes the order, a late replay of its key gets `409` and the order is never recreated. Keys live as long as their orders.
- A parallel test alone proves little: a naive check-then-insert passed it 3/3 times because its race window is microseconds wide. So the unique index, and the `CHECK` that forbids an API order without a key, are tested directly.

## 2 · Pagination: keyset cursor + virtualised infinite list

**Decision.** Keyset pagination: 50 rows per page after an opaque `(sort value, id)` cursor. Each filter × sort combination is served by a composite index ending in `id`. TanStack Virtual renders only the visible rows and fetches the next page while the agent scrolls. Counts stop at 10,000.
**Alternative.** `OFFSET` pagination with page numbers and an exact total, which is what agents know from the spreadsheet.
**Why rejected.** `OFFSET` slows down with depth: at row 40,000 it takes 3.7 ms against 0.06 ms for keyset, and the gap grows with the table. It also shifts every page while agents add orders, so rows repeat or vanish between pages. Agents find orders by searching; nobody jumps to page 812. The cost: no "page N of M", and a capped count.

## 3 · Client server-state: React Query keyed by URL filters, no global store

**Decision.** Filters live in the URL. Each combination is its own React Query key, and the query's `AbortSignal` is passed to `fetch`. A superseded request is aborted, and a late answer can only fill its own key's cache entry, which nothing renders. There is no `keepPreviousData`: while new filters load, the table shows skeleton rows, never rows from the old filter.
**Alternative.** A hand-written `useEffect` + `AbortController` + "is this still the latest request?" counter, with results in component or Redux state.
**Why rejected.** That guard has to be remembered in every list, every next-page fetch and every retry path. Keying results by request makes "an older response overwrites a newer one" impossible by construction; the tests prove it even when a request is never cancelled. The cost is library behaviour to know (cancel on unmount, transitions), commented where it matters.
