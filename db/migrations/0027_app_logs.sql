-- Platform-wide application logs for the superadmin console.
-- One row per captured error or major domain event. Request bodies, tokens,
-- credentials, and provider payloads are never stored; detail_json holds only
-- scrubbed metadata (for example an error stack).
CREATE TABLE IF NOT EXISTS app_logs (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  level TEXT NOT NULL,
  event TEXT NOT NULL,
  surface TEXT NOT NULL,
  message TEXT NOT NULL,
  path TEXT,
  method TEXT,
  status_code INTEGER,
  user_id TEXT,
  user_email TEXT,
  org_id TEXT,
  org_name TEXT,
  ip TEXT,
  user_agent TEXT,
  request_id TEXT,
  detail_json TEXT
);

CREATE INDEX IF NOT EXISTS app_logs_created_idx ON app_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS app_logs_level_created_idx ON app_logs(level, created_at DESC);
CREATE INDEX IF NOT EXISTS app_logs_event_created_idx ON app_logs(event, created_at DESC);
CREATE INDEX IF NOT EXISTS app_logs_user_idx ON app_logs(user_id);
CREATE INDEX IF NOT EXISTS app_logs_org_idx ON app_logs(org_id);
