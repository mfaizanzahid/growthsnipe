-- Blueprint baseline flow: a Blueprint purchase either links an existing
-- Diagnostic baseline or creates a new baseline run for the Blueprint order.

ALTER TABLE diagnostic_runs ADD COLUMN purpose TEXT NOT NULL DEFAULT 'diagnostic';

ALTER TABLE one_time_orders ADD COLUMN baseline_run_id TEXT;
ALTER TABLE one_time_orders ADD COLUMN baseline_email_sent_at INTEGER;

CREATE INDEX IF NOT EXISTS one_time_orders_baseline_run_idx
  ON one_time_orders (baseline_run_id);
