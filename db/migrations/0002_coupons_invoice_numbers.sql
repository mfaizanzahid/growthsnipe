-- Discount coupons + invoice numbering.
-- Discount lines are stored as negative-amount invoice_items rows.

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  percent_off INTEGER,
  amount_off_minor INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  duration TEXT NOT NULL DEFAULT 'once',
  duration_cycles INTEGER,
  applies_to_setup INTEGER NOT NULL DEFAULT 0,
  max_redemptions INTEGER,
  redeemed_count INTEGER NOT NULL DEFAULT 0,
  valid_from INTEGER,
  valid_until INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS coupon_plans (
  coupon_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  UNIQUE (coupon_id, plan_id)
);
CREATE INDEX IF NOT EXISTS coupon_plans_plan_idx ON coupon_plans (plan_id);

CREATE TABLE IF NOT EXISTS subscription_coupons (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  coupon_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  cycles_applied INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS subscription_coupons_sub_idx ON subscription_coupons (subscription_id);

-- Human-visible invoice numbers (INV-YYYY-NNNN), assigned in Phase 2.
-- (SQLite cannot ADD a UNIQUE column; uniqueness comes from the index below.)
ALTER TABLE invoices ADD COLUMN number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_idx ON invoices (number);

CREATE TABLE IF NOT EXISTS invoice_sequences (
  year INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);
