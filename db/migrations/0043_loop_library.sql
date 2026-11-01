-- Free Loop Library capture + marketing email automation.
--
-- Pre-auth leads: no org linkage by design. Duplicate submits upsert the lead
-- and INSERT OR IGNORE the sequence rows, so re-submits never double-send.
-- Unsubscribe is enforced by the runner on every send (lead flag + global
-- suppression table). Auth and billing sends never read these tables.
CREATE TABLE IF NOT EXISTS loop_library_leads (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  trade TEXT NOT NULL,
  software TEXT,
  monthly_volume TEXT,
  consent_at INTEGER NOT NULL,
  consent_text_version TEXT NOT NULL DEFAULT 'v1',
  unsubscribed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS loop_leads_email_idx ON loop_library_leads (email);

CREATE TABLE IF NOT EXISTS marketing_sends (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  email TEXT NOT NULL,
  sequence TEXT NOT NULL,
  step_key TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  sent_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_sends_dedupe_idx ON marketing_sends (email, sequence, step_key);
CREATE INDEX IF NOT EXISTS marketing_sends_due_idx ON marketing_sends (status, due_at);

CREATE TABLE IF NOT EXISTS marketing_suppressions (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT 'unsubscribe',
  created_at INTEGER NOT NULL
);
