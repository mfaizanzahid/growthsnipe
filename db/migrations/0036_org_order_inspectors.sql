-- Inspector junction: inspector_names is a JSON array and cannot be indexed.
-- One row per (org, order, inspector) enables GROUP BY inspector in SQL.
-- Local/dev only in this pass; history rows gain junction rows on re-sync.

CREATE TABLE IF NOT EXISTS org_order_inspectors (
  organization_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  inspector_name TEXT NOT NULL,
  PRIMARY KEY (organization_id, order_id, inspector_name)
);

CREATE INDEX IF NOT EXISTS org_order_inspectors_org_insp_idx
  ON org_order_inspectors (organization_id, inspector_name, order_id);

CREATE INDEX IF NOT EXISTS org_order_inspectors_org_order_idx
  ON org_order_inspectors (organization_id, order_id);
