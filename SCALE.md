# SCALE: 5 million orders, three developers, agents in two countries

The forces: 100× the rows, the same small team, and two countries on the console all day (say Saudi Arabia and Egypt). So query cost must not grow with table size, nothing may need a dedicated ops person, and "today" now has two meanings. Numbers below are from `npm run bench` at 50k rows, scaled linearly where the plan is a scan.

```
 agents (KSA) ──┐                          ┌─► Postgres primary (one region) ──► PITR backups
                ├─► CDN (SPA) ─► API ×2-3 ─┤        │ streaming replica (reads: list, stats)
 agents (EG)  ──┘   stateless, same build  └─► rollups: daily_order_totals
```

## What I would change

1. **SQLite → managed PostgreSQL**: one primary, one read replica, point-in-time recovery. SQLite is one writer on one machine, and two countries need more than one API instance. The SQL ports almost 1:1. The composite indexes (`orders_status_created_idx`…) stay, and so do `UNIQUE (created_by, idempotency_key)` with `INSERT … ON CONFLICT DO NOTHING` and the row-value keyset `(created_at, id) < ($1, $2)`. `better-sqlite3`'s synchronous calls become an async `pg` pool, so one slow query no longer blocks the event loop.
2. **Search.** FTS5 trigram becomes a `pg_trgm` GIN index on name and email. The current worst case, a term matching every row, costs 18 ms here only because SQLite sorts every match: about 2 s at 5M. Fixes: require 3+ characters (the 1–2 character fallback is a full scan, 8 ms here and about 0.8 s there), cap matches before sorting, and add a `lower(email)` B-tree for the most common lookup (pasting an email).
3. **Stats from rollups, not `GROUP BY`.** The report scans the table (11 ms here, about 1 s at 5M). Instead, keep a `daily_order_totals(day, zone, status, count, amount)` table updated in the same transaction as each create or status change. "Revenue today" then reads a handful of rows. The deliberate 3–6 s delay goes away; the cancellation and retry UI stays.
4. **Time zones per agent.** "Today" is currently Riyadh midnight, and an agent in Cairo has a different day for part of the year. Store each agent's zone, compute day boundaries per zone, and keep the zone visible on the card.
5. **Shared state out of process memory.** The login rate limiter is in memory today and would reset per instance. Move it to the gateway or Postgres.
6. **Observability before features.** Request ids, p95 per route, slow-query log, and alerts on 5xx and latency. Three developers cannot watch dashboards; the system has to page them.

## What I would deliberately keep

- **Keyset pagination + virtualisation.** Page 40,000 costs the same as page 1 (one index seek), so it scales unchanged. Capped counts (10,000+) bound the only O(n) query on the list.
- **Idempotency on the order row.** The guarantee sits in one unique index, so it holds across instances. Moving the database does not change the design.
- **One deployable, one repo, shared zod contracts, TypeScript end to end.** Three people can keep the whole system in their heads, and client and server cannot drift apart.
- **URL-keyed queries** (latest-wins by construction) and **soft delete** (financial records stay).

## What I would refuse to build, even if asked

- **Active-active writes in both countries.** Two primaries reconciling concurrent writes would generate the very duplicate orders this system exists to prevent. One primary region adds ~50–80 ms for the far country, which is fine for a console.
- **Microservices, Kafka, CQRS or Elasticsearch** for three developers, before `pg_trgm` and rollups have been measured and found wanting.
- **Sharding or partitioning at 5M rows.** That is about 2 GB, comfortable for one Postgres node. Revisit at around 100M rows or when VACUUM and index builds start hurting.
- **"Export everything to the browser", or page-number pagination over 5M rows.**
- **A "delete all cancelled orders" button.** The README answer proposes a retention job that anonymises old cancelled orders, with an audit log.
