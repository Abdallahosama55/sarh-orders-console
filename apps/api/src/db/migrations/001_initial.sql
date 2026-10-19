-- 001 · initial schema. See docs/specs/02-design.md §3.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE CHECK (email = lower(email)),
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('admin', 'agent')),
  password_hash TEXT    NOT NULL,              -- scrypt$N$r$p$salt$hash, never plaintext (SEC-7)
  token_version INTEGER NOT NULL DEFAULT 0,    -- incremented to revoke every issued session (SEC-4)
  created_at    INTEGER NOT NULL
) STRICT;

CREATE TABLE orders (
  id                  INTEGER PRIMARY KEY,
  customer_name       TEXT    NOT NULL,
  customer_email      TEXT    NOT NULL,
  status              TEXT    NOT NULL
                      CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  total_cents         INTEGER NOT NULL CHECK (total_cents >= 0),
  created_at          INTEGER NOT NULL,        -- epoch milliseconds, UTC
  created_by          INTEGER REFERENCES users (id),   -- NULL = imported from the spreadsheet
  idempotency_key     TEXT,
  request_fingerprint TEXT,                    -- sha256 of the normalised create request
  deleted_at          INTEGER,                 -- soft delete: orders are financial records
  deleted_by          INTEGER REFERENCES users (id),

  -- R2: at most one order per user and idempotency key, whatever the application code does.
  UNIQUE (created_by, idempotency_key),
  -- NULLs are distinct in a UNIQUE constraint, so an API-created order without a key would
  -- silently escape the guarantee above. Make that state unrepresentable.
  CHECK (
    (created_by IS NULL AND idempotency_key IS NULL AND request_fingerprint IS NULL)
    OR (created_by IS NOT NULL AND idempotency_key IS NOT NULL AND request_fingerprint IS NOT NULL)
  ),
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
) STRICT;

CREATE TABLE order_items (
  id               INTEGER PRIMARY KEY,
  order_id         INTEGER NOT NULL REFERENCES orders (id),
  product_name     TEXT    NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0)
) STRICT;

-- R1: one composite index per (filter, sort) shape. The trailing id matches the ORDER BY
-- tie-breaker, so a keyset page is a single index range seek with no sort step.
CREATE INDEX orders_created_idx        ON orders (created_at, id);
CREATE INDEX orders_total_idx          ON orders (total_cents, id);
CREATE INDEX orders_status_created_idx ON orders (status, created_at, id);
CREATE INDEX orders_status_total_idx   ON orders (status, total_cents, id);
CREATE INDEX order_items_order_idx     ON order_items (order_id);

-- R1: substring search on name/email. A B-tree cannot serve LIKE '%term%'; a trigram index can
-- (SQLite's equivalent of PostgreSQL's pg_trgm). Kept in sync by the triggers below.
CREATE VIRTUAL TABLE orders_search USING fts5 (customer_name, customer_email, tokenize = 'trigram');

CREATE TRIGGER orders_search_after_insert AFTER INSERT ON orders BEGIN
  INSERT INTO orders_search (rowid, customer_name, customer_email)
  VALUES (new.id, new.customer_name, new.customer_email);
END;

CREATE TRIGGER orders_search_after_update AFTER UPDATE OF customer_name, customer_email ON orders BEGIN
  UPDATE orders_search
  SET customer_name = new.customer_name, customer_email = new.customer_email
  WHERE rowid = new.id;
END;

CREATE TRIGGER orders_search_after_delete AFTER DELETE ON orders BEGIN
  DELETE FROM orders_search WHERE rowid = old.id;
END;
