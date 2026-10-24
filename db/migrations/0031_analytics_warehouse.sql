-- Analytics warehouse: local copy of provider orders for fast dashboards.
-- One row per provider order per org; upserts keyed by (organization_id, provider, provider_order_id).

CREATE TABLE IF NOT EXISTS org_sync_state (
  organization_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'backfilling',
  cursor_date TEXT,
  last_synced_at INTEGER,
  total_fetched INTEGER NOT NULL DEFAULT 0,
  error_text TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS org_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_order_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at TEXT,
  completed_at TEXT,
  total_minor INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  inspector_names TEXT NOT NULL DEFAULT '[]',
  buyer_name TEXT,
  buyer_email TEXT,
  buyer_phone TEXT,
  buying_agent_name TEXT,
  buying_agent_email TEXT,
  buying_agent_phone TEXT,
  selling_agent_name TEXT,
  service_type TEXT,
  referral_source TEXT,
  address TEXT,
  provider_updated_at TEXT,
  synced_at INTEGER NOT NULL,
  raw_json TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS org_orders_org_provider_order_idx
  ON org_orders (organization_id, provider, provider_order_id);
CREATE INDEX IF NOT EXISTS org_orders_org_scheduled_idx
  ON org_orders (organization_id, scheduled_at);
CREATE INDEX IF NOT EXISTS org_orders_org_status_idx
  ON org_orders (organization_id, status);

CREATE TABLE IF NOT EXISTS org_order_services (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'base',
  amount_minor INTEGER
);
CREATE INDEX IF NOT EXISTS org_order_services_org_order_idx
  ON org_order_services (organization_id, order_id);

CREATE TABLE IF NOT EXISTS org_agents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  first_seen_at TEXT,
  last_seen_at TEXT,
  order_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS org_agents_org_idx ON org_agents (organization_id);
CREATE INDEX IF NOT EXISTS org_agents_org_email_idx ON org_agents (organization_id, email);
CREATE INDEX IF NOT EXISTS org_agents_org_phone_idx ON org_agents (organization_id, phone);

CREATE TABLE IF NOT EXISTS org_inspector_targets (
  organization_id TEXT NOT NULL,
  inspector_name TEXT NOT NULL,
  jobs_per_day REAL NOT NULL DEFAULT 2,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (organization_id, inspector_name)
);

CREATE TABLE IF NOT EXISTS org_dashboard_layouts (
  organization_id TEXT PRIMARY KEY,
  widgets_json TEXT NOT NULL DEFAULT '[]',
  default_range TEXT NOT NULL DEFAULT 'last_12m',
  updated_at INTEGER NOT NULL
);
