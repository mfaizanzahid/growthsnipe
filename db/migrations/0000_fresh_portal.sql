-- Fresh SaaS billing portal schema (GHL removed). Manual Safepay billing only.
-- Better Auth core
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  is_superadmin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  expires_at INTEGER,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Orgs
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (org_id, user_id)
);
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Catalog
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_minor INTEGER NOT NULL,
  annual_minor INTEGER NOT NULL,
  setup_fee_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Manual subscription schedule (Worker Cron owns renewals; no sub_/plan_ refs)
CREATE TABLE IF NOT EXISTS org_subscriptions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  interval TEXT NOT NULL DEFAULT 'month',
  interval_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  start_date INTEGER NOT NULL,
  next_charge INTEGER NOT NULL,
  total_cycles INTEGER,
  cycles_charged INTEGER NOT NULL DEFAULT 0,
  recurring_amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  default_payment_method_id TEXT,
  canceled_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS org_subscriptions_org_idx ON org_subscriptions (org_id);
CREATE INDEX IF NOT EXISTS org_subscriptions_due_idx ON org_subscriptions (status, next_charge);
-- Safepay mappings
CREATE TABLE IF NOT EXISTS safepay_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL UNIQUE,
  customer_token_encrypted TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_methods (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT,
  safepay_payment_method_token_encrypted TEXT NOT NULL,
  brand TEXT,
  last4 TEXT,
  expiry_month INTEGER,
  expiry_year INTEGER,
  is_default INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS payment_methods_org_idx ON payment_methods (org_id);
-- Billing
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  subscription_id TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'due',
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  idempotency_key TEXT UNIQUE,
  tracker TEXT,
  charge_id TEXT,
  due_at INTEGER,
  paid_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS invoices_org_idx ON invoices (org_id);
CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  invoice_id TEXT,
  tracker TEXT,
  charge_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS transactions_org_idx ON transactions (org_id);
-- Webhooks + idempotency
CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_id TEXT,
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json_redacted TEXT NOT NULL,
  processed_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (source, external_id)
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  operation TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Seed plans: Launch $199/mo ($1990/yr assumed 2mo free) + $497 setup; Growth $299/mo ($2990/yr) + $697 setup. USD.
INSERT OR IGNORE INTO plans (id, name, monthly_minor, annual_minor, setup_fee_minor, currency, active, created_at, updated_at)
VALUES
  ('launch', 'Launch', 19900, 199000, 49700, 'USD', 1, 1756857600, 1756857600),
  ('growth', 'Growth', 29900, 299000, 69700, 'USD', 1, 1756857600, 1756857600);
