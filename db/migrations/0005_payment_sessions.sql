-- Browser payment sessions (Safepay Atoms). The confirm step reconciles the
-- stored amount against the invoice so a client can never underpay by
-- requesting a smaller session than the computed total.
CREATE TABLE IF NOT EXISTS payment_sessions (
  tracker TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS payment_sessions_org_idx ON payment_sessions (org_id);
