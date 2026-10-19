# 01 · Requirements — Orders Console

| | |
|---|---|
| **Source** | SARH take-home brief v2 (sent 18 Oct 2026, due 22 Oct 2026) |
| **Level** | Senior (adds `SCALE.md`) |
| **Process** | Spec-driven: this file → [`02-design.md`](02-design.md) → [`03-tasks.md`](03-tasks.md). Every requirement ID below is traced to tests in [`../qa/TEST-PLAN.md`](../qa/TEST-PLAN.md). |

## 1. Problem

An operations team handles tens of thousands of orders a month in a spreadsheet. Agents must find an order in seconds and register phone orders by hand. **Duplicate orders are their biggest complaint.**

Goals, in priority order:

1. The list is fast at 50,000+ rows and **never shows results for anything except the latest query** (R1).
2. Creating an order **can never produce two orders** from one submission: not from a double-click, a network retry, or a resend after a timeout (R2).
3. The inherited auth middleware is reviewed and its problems are fixed (SEC).
4. Optional O1: a deliberately slow stats endpoint that the UI handles without blocking.

## 2. Users and roles

| Role | Can |
|---|---|
| `agent` | Sign in, search/filter/sort orders, view an order, create orders, view stats |
| `admin` | Everything an agent can, plus delete an order |

## 3. Assumptions

The brief leaves these open. Each is a deliberate choice and is listed again in the README.

| ID | Assumption |
|---|---|
| A-1 | Single currency, **SAR**. Money is stored as integer halalas (cents) and never as floats. |
| A-2 | The order amount is **derived from its line items** (Σ quantity × unit price). The server computes it and never accepts a total from the client. |
| A-3 | New orders start as `pending`. Status changes are out of scope. |
| A-4 | Seeded orders represent the spreadsheet import, so they have no creator and no idempotency key. |
| A-5 | "Revenue today" = orders **created** today in the business time zone (`Asia/Riyadh`) whose status is `paid`, `shipped` or `delivered`. There is no payment history to do better. |
| A-6 | O1 "error state with one retry" = a visible error with a single **Retry** action. No silent automatic retries, which would double a 3–6 s wait before the agent sees anything. |
| A-7 | "Delete" means a **soft delete**: the order is hidden from the console but kept, with who deleted it and when. Orders are financial records. |
| A-8 | Search also accepts an order number (`#123` or `123`), because customers on the phone quote it. It is a small extension to "search name/email". |

## 4. Functional requirements

Priority: **P0** = graded behaviour named in the brief, **P1** = needed for a correct product, **P2** = polish.

### R1 · Orders list

| ID | Requirement | Acceptance criteria | P |
|---|---|---|---|
| R1-1 | The list shows order #, customer name and email, status, item count, total and created date. | Columns render for every row. Arabic names render correctly (`dir="auto"`). | P1 |
| R1-2 | Search by customer name or email: substring, case-insensitive. | `ahmed` matches "Ahmed Al-Harbi" and `ahmed.k@example.com`. `AHMED` gives the same result. Quotes, `%` and `_` are treated literally. | P0 |
| R1-3 | Filter by status (all / pending / paid / shipped / delivered / cancelled). | Every row shown has the selected status. | P0 |
| R1-4 | Sort by created date or amount, ascending or descending. Ties are broken by id so the order is total and stable. | Rows are monotonic in the sort key. Paging never duplicates or skips a row. | P0 |
| R1-5 | **When** the list is requested, **the server shall** return at most one page (default 50, maximum 100) plus an opaque cursor for the next page. | The API rejects `limit > 100`. The full table is never sent. | P0 |
| R1-6 | The browser renders only the rows in view (virtualisation) and loads further pages as the user scrolls. | DOM row count stays under ~60 regardless of rows loaded. Scrolling to the end of a filter loads every matching row exactly once. | P0 |
| R1-7 | Every filter × sort combination is served from an index, with no full-table sort. Substring search uses a trigram index. | `EXPLAIN QUERY PLAN` contains no `USE TEMP B-TREE FOR ORDER BY` for non-search queries (automated test). Indexes are listed in the README. | P0 |
| R1-8 | **Latest wins.** **When** filters change while earlier requests are in flight, **the system shall** display only the result of the latest request. Superseded requests are cancelled. | Change the status filter three times quickly, with earlier responses delayed so they arrive last: the final screen shows only the last filter's rows, and the earlier requests are aborted (component and E2E tests). | **P0** |
| R1-9 | Filter state lives in the URL. | Reloading or sharing `/orders?status=paid&q=ahmed` restores the same view. | P1 |
| R1-10 | Loading, empty, error and "loading more" states are distinct. The result count is shown, capped at "10,000+". | Each state is visible in tests. The count is announced through an `aria-live` region. | P1 |
| R1-11 | Clicking an order opens a detail panel with its line items. | Items, quantities, unit prices and the total are shown. The panel closes with Esc. | P2 |
| R1-12 | The seed script creates ≥ 50,000 orders with 1–5 line items, deterministically. | `npm run seed` reports 50,000 orders. Re-running produces the same customers and amounts. | P0 |

### R2 · Create order without duplicates

| ID | Requirement | Acceptance criteria | P |
|---|---|---|---|
| R2-1 | A form captures customer name, customer email and 1–20 items (product, quantity, unit price), and shows the total live. | The total updates as items change. Items can be added and removed. | P0 |
| R2-2 | The same validation rules apply on client and server, from one shared schema. | Invalid input is rejected by the form before any request. A request that bypasses the form is rejected by the server with 400 and per-field messages. | P0 |
| R2-3 | Every create request carries an `Idempotency-Key` (UUID). The key belongs to the **draft**: retries, double-clicks and resends reuse it. A new key is issued only after a confirmed success, when the agent starts the next order. | The header is present. Automatic retries and a manual "Try again" send the same key. | P0 |
| R2-4 | **The server shall** create at most one order per (user, idempotency key), enforced by a **database unique constraint** inside one transaction. This holds across concurrent requests and across separate server processes. | Two (and twenty) identical requests fired in parallel produce exactly one order. This is proven in-process (integration test) and across two OS processes sharing the database (proof script). | **P0** |
| R2-5 | A repeated request with the same key and the same body returns the original order (`201`, `Idempotent-Replayed: true`). | Both parallel responses carry the same order id. | P0 |
| R2-6 | A repeated key with a **different** body is rejected with `422 idempotency_key_reused`, and no order is created. | The response points to the existing order. Order count is unchanged. | P0 |
| R2-7 | A request rejected by validation (`400`) does not consume its key. | After fixing the input, the same key creates the order. | P1 |
| R2-8 | The client disables submit while a request is in flight. It retries network failures, timeouts and 502/503/504 automatically (up to 2 retries) with the same key. It keeps the draft and key in `sessionStorage`, so a page reload mid-submit cannot mint a new key. | Double-clicking sends one request. A lost response followed by a retry shows the original order. A reloaded draft keeps its key. | P0 |
| R2-9 | **Proof:** a script fires the same create request twice in parallel and shows exactly one order exists. | `npm run proof:duplicates` exits 0 and prints the count read from the database. | **P0** |

### SEC · Authentication and authorisation (code-review fixes)

| ID | Requirement | Acceptance criteria | P |
|---|---|---|---|
| SEC-1 | Tokens are **verified** (signature, algorithm pinned to HS256, issuer, audience, expiry), not merely decoded. | Forged, `alg:none`, wrong-secret, wrong-audience and expired tokens all get 401. | P0 |
| SEC-2 | The signing secret comes from the environment, is at least 32 characters, and the app refuses to start without it. `npm run setup` generates a random one. No secret is committed. | Startup fails with a clear message when `JWT_SECRET` is missing or short. | P0 |
| SEC-3 | The session token travels only in an `httpOnly`, `SameSite=Strict` cookie scoped to `/api`. Tokens in query strings or `Authorization` headers are ignored. State-changing requests from a foreign `Origin` are rejected. | `?token=` gets 401. `Origin: https://evil.example` on POST gets 403. | P0 |
| SEC-4 | Sessions expire after 8 h and can be revoked: logout bumps the user's `token_version`, which invalidates every token issued before it. | A token used after logout gets 401. | P1 |
| SEC-5 | Identity and role are loaded from the database on every request. The role is never taken from the token or the client. | Demoting a user in the database takes effect on their next request. | P0 |
| SEC-6 | Authorisation is enforced on the server. Delete is admin-only. | An agent's `DELETE /api/orders/:id` gets 403. The UI hides the button for agents as UX only. | P0 |
| SEC-7 | Passwords are stored as salted scrypt hashes and compared in constant time. Unknown emails take the same code path, so there is no user enumeration. | No plaintext in the database. Login errors are identical for unknown email and wrong password. | P0 |
| SEC-8 | Login input is type-validated, so objects like `{"email":{"not":""}}` cannot reach the query layer (operator injection). | Non-string credentials get 400. | P0 |
| SEC-9 | Login is rate-limited per IP + email (10 failures per 15 min). | The 11th failure gets 429. | P1 |
| SEC-10 | Every `/api/orders` route requires authentication. | Unauthenticated calls get 401. | P0 |
| SEC-11 | Async errors are handled centrally. Missing resources return 404, bad ids return 400, and stack traces never leak. | Deleting an unknown id returns 404, not a crash. | P1 |
| SEC-12 | The seed creates one admin and two agents. Credentials are documented in the README. | Logins in the README work. | P0 |

### O1 · Slow stats (optional; chosen over O2)

| ID | Requirement | Acceptance criteria | P |
|---|---|---|---|
| O1-1 | `GET /api/orders/stats` returns count and amount per status, plus revenue today, after a deliberate 3–6 s delay. | The response arrives in 3–6 s with correct numbers. | P0 |
| O1-2 | The UI never blocks: the page renders immediately with a loading state and elapsed timer, and the rest of the app stays usable. | Navigation works while stats load. | P0 |
| O1-3 | Navigating away cancels the request in the browser **and** the server stops work for it. | The request is aborted (E2E). The server logs that the report was skipped. | P0 |
| O1-4 | Failure shows a visible error state with a single Retry action that issues exactly one new request. | Error panel → Retry → data. The button is disabled while retrying. | P0 |

## 5. Non-functional requirements

| ID | Requirement | Verification |
|---|---|---|
| NFR-1 | Runs locally in under five minutes with no paid, hosted or Docker services: `npm install && npm run setup && npm run dev`. | Fresh-clone run in the QA report |
| NFR-2 | List API p95 < 50 ms at 50,000 rows for every filter/sort/search combination on a laptop. | `npm run bench` |
| NFR-3 | Strict TypeScript end to end, with no `any` in application code. Lint is clean. | `npm run typecheck && npm run lint` |
| NFR-4 | Only `.env.example` is committed. `.env` and database files are git-ignored. | `git ls-files` |
| NFR-5 | Accessibility basics: labelled controls, keyboard-reachable rows, `aria-sort`, an `aria-live` result count, and a focus-managed detail panel. | Component tests query by role and label |
| NFR-6 | Logs never contain tokens, passwords or search terms (customer PII). | Code review of `request-logger.ts` |

## 6. Out of scope

O2 optimistic create (O1 was chosen) · status transitions · user management and password reset · refresh tokens / MFA · detection of *business* duplicates (two separate drafts for the same real-world order; see open question Q-2) · deployment, HTTPS, Docker · full i18n/RTL UI (the data supports Arabic text).

## 7. Open questions for the operations lead

| ID | Question | Interim decision |
|---|---|---|
| Q-1 | "Delete all cancelled orders": why, and what must be kept? | Not built. See the README product answer. |
| Q-2 | When two agents enter the same phone order separately, is that a duplicate? What window, and which fields must match? | Not enforced. The idempotency key covers retries of one submission only. A soft "possible duplicate" warning is the proposed next step. |
| Q-3 | Whose "today" counts for revenue when agents sit in two countries? | `Asia/Riyadh`, shown in the UI. |
