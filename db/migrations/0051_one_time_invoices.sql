-- Guest one-time purchase invoices. Kept separate from org-scoped `invoices`
-- because one-time buyers have no organization.

CREATE TABLE IF NOT EXISTS one_time_invoices (
  id TEXT PRIMARY KEY,
  one_time_order_id TEXT NOT NULL UNIQUE,
  number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'paid',
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  business_name TEXT,
  items_json TEXT NOT NULL,
  tracker TEXT,
  charge_id TEXT,
  paid_at INTEGER,
  email_sent_at INTEGER,
  email_resend_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS one_time_invoices_order_idx
  ON one_time_invoices (one_time_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS one_time_invoices_number_idx
  ON one_time_invoices (number);
CREATE INDEX IF NOT EXISTS one_time_invoices_created_idx
  ON one_time_invoices (created_at DESC);
