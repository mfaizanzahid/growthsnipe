-- Per-user dashboard period preference (one row per user per workspace).
-- Falls back to org_dashboard_layouts.default_range when absent, so existing
-- workspaces keep their org default until a member picks their own period.
CREATE TABLE IF NOT EXISTS user_dashboard_prefs (
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  preset TEXT NOT NULL DEFAULT 'last_12m',
  custom_from TEXT,
  custom_to TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, organization_id)
);
