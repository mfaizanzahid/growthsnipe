-- One-time product checkout (SNIPE Diagnostic / Blueprint).
--
-- Guest-capable: buyers may have no workspace or account, so these tables are
-- deliberately NOT org-scoped and carry no foreign keys into tenant tables.
-- Amounts are always server-computed from one_time_products; the client never
-- sets a price. Idempotency is enforced by the UNIQUE idempotency_key.
CREATE TABLE IF NOT EXISTS one_time_products (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO one_time_products (id, slug, name, amount_minor, currency, active, created_at)
VALUES
  ('otp_diagnostic', 'diagnostic', 'SNIPE Diagnostic', 19900, 'USD', 1, strftime('%s','now') * 1000),
  ('otp_blueprint', 'blueprint', 'SNIPE Blueprint', 99900, 'USD', 1, strftime('%s','now') * 1000);

CREATE TABLE IF NOT EXISTS one_time_orders (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  business_name TEXT,
  trade TEXT,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending',
  tracker TEXT UNIQUE,
  charge_id TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  receipt_sent_at INTEGER,
  intake_sent_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS one_time_orders_email_idx ON one_time_orders (email);
CREATE INDEX IF NOT EXISTS one_time_orders_status_idx ON one_time_orders (status);
CREATE INDEX IF NOT EXISTS one_time_orders_tracker_idx ON one_time_orders (tracker);
