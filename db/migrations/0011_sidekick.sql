-- Business Sidekick MCP (V1 market test) tables.
-- Provider credentials stored encrypted; MCP tokens stored as hash only.

CREATE TABLE IF NOT EXISTS sidekick_connections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  encrypted_credentials TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  capabilities_json TEXT,
  external_account_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS sidekick_connections_org_provider_idx ON sidekick_connections (organization_id, provider);
CREATE INDEX IF NOT EXISTS sidekick_connections_org_idx ON sidekick_connections (organization_id);

CREATE TABLE IF NOT EXISTS sidekick_mcp_tokens (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS sidekick_mcp_tokens_hash_idx ON sidekick_mcp_tokens (token_hash);
CREATE INDEX IF NOT EXISTS sidekick_mcp_tokens_org_idx ON sidekick_mcp_tokens (organization_id);

CREATE TABLE IF NOT EXISTS sidekick_policies (
  organization_id TEXT PRIMARY KEY,
  write_permission TEXT NOT NULL DEFAULT 'READ',
  allowed_actions_json TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sidekick_schedules (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  type TEXT NOT NULL,
  timezone TEXT NOT NULL,
  local_time TEXT NOT NULL,
  rule_json TEXT NOT NULL DEFAULT '{}',
  delivery_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sidekick_schedules_org_idx ON sidekick_schedules (organization_id);
CREATE INDEX IF NOT EXISTS sidekick_schedules_due_idx ON sidekick_schedules (enabled, next_run_at);

CREATE TABLE IF NOT EXISTS sidekick_briefing_jobs (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  payload_json TEXT,
  briefing_text TEXT,
  error_text TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS sidekick_briefing_jobs_dedupe_idx ON sidekick_briefing_jobs (schedule_id, period_key);
CREATE INDEX IF NOT EXISTS sidekick_briefing_jobs_org_idx ON sidekick_briefing_jobs (organization_id);

CREATE TABLE IF NOT EXISTS sidekick_audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  tool TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  request_json TEXT,
  before_json TEXT,
  result_json TEXT,
  status TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sidekick_audit_logs_org_idx ON sidekick_audit_logs (organization_id);
