-- Superadmin report resend tracking and a newest-first index for the report list.

ALTER TABLE diagnostic_runs ADD COLUMN report_email_resent_at INTEGER;
ALTER TABLE diagnostic_runs ADD COLUMN report_email_resend_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS diagnostic_runs_created_idx
  ON diagnostic_runs (created_at DESC);
