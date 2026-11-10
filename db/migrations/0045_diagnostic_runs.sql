-- SNIPE Diagnostic guest runs.
--
-- Buyers purchase the one-time Diagnostic as guests (one_time_orders is not
-- org-scoped), so these tables are deliberately NOT tenant tables. Credentials
-- are encrypted at rest; diagnostic_orders is temporary and cleared once the
-- report is ready. The PDF is never stored: it is rendered on demand from
-- facts_json + narrative_json.
CREATE TABLE IF NOT EXISTS diagnostic_runs (
  id TEXT PRIMARY KEY,
  one_time_order_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  provider TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_connection',
  stage TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  window_from TEXT,
  window_to TEXT,
  facts_json TEXT,
  narrative_json TEXT,
  connect_email_sent_at INTEGER,
  report_email_sent_at INTEGER,
  error_text TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ready_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS diagnostic_runs_order_idx ON diagnostic_runs (one_time_order_id);
CREATE INDEX IF NOT EXISTS diagnostic_runs_email_idx ON diagnostic_runs (email);
CREATE INDEX IF NOT EXISTS diagnostic_runs_status_idx ON diagnostic_runs (status);

CREATE TABLE IF NOT EXISTS diagnostic_credentials (
  run_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  encrypted_credentials TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  validated_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS diagnostic_orders (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  provider_order_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at TEXT,
  completed_at TEXT,
  total_minor INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  paid INTEGER,
  service_type TEXT,
  services_json TEXT,
  inspector_names TEXT NOT NULL DEFAULT '[]',
  buyer_name TEXT,
  buyer_email TEXT,
  buyer_phone TEXT,
  buying_agent_name TEXT,
  buying_agent_email TEXT,
  buying_agent_phone TEXT,
  agency_name TEXT,
  selling_agent_name TEXT,
  referral_source TEXT,
  city TEXT,
  address TEXT,
  details_json TEXT,
  synced_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS diagnostic_orders_run_sched_idx ON diagnostic_orders (run_id, scheduled_at);
CREATE UNIQUE INDEX IF NOT EXISTS diagnostic_orders_run_order_idx ON diagnostic_orders (run_id, provider_order_id);

CREATE TABLE IF NOT EXISTS diagnostic_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS diagnostic_events_run_idx ON diagnostic_events (run_id, created_at);
