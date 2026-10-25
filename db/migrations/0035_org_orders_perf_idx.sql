-- Perf indexes for org_orders range scans + materialized agent_key.
-- Local/dev only in this pass; prod apply is a separate owner-approved step.
-- Single-apply like every other migration in this repo (wrangler journals
-- applied files); index/table statements are IF NOT EXISTS guarded.

ALTER TABLE org_orders ADD COLUMN agent_key TEXT;

-- Best-effort backfill for existing rows. Phone normalization here is
-- approximate (SQLite has no regex, so common separators are stripped
-- explicitly); sync.ts rewrites the canonical agent_key (lower email,
-- digits-only phone) on the next upsert of each row.
UPDATE org_orders SET agent_key =
  CASE
    WHEN buying_agent_email IS NOT NULL AND trim(buying_agent_email) <> ''
      THEN 'e:' || lower(trim(buying_agent_email))
    WHEN buying_agent_phone IS NOT NULL AND length(
      replace(replace(replace(replace(replace(replace(replace(buying_agent_phone, '-', ''), ' ', ''), '(', ''), ')', ''), '+', ''), '.', ''), '/', '')
    ) >= 7
      THEN 'p:' || replace(replace(replace(replace(replace(replace(replace(buying_agent_phone, '-', ''), ' ', ''), '(', ''), ')', ''), '+', ''), '.', ''), '/', '')
    ELSE NULL
  END
WHERE agent_key IS NULL;

-- Covers: overview totals/monthly + order list ORDER BY + keyset pagination.
CREATE INDEX IF NOT EXISTS org_orders_org_sched_id_idx
  ON org_orders (organization_id, scheduled_at DESC, id DESC);

-- Covers: status-filtered ranges (coverage, basket, pending/completed splits).
CREATE INDEX IF NOT EXISTS org_orders_org_status_sched_idx
  ON org_orders (organization_id, status, scheduled_at);

-- Covers: windowed agent leaderboard GROUP BY agent_key.
CREATE INDEX IF NOT EXISTS org_orders_org_agent_sched_idx
  ON org_orders (organization_id, agent_key, scheduled_at);

-- Covers: basket GROUP BY name once the range is narrowed via join.
CREATE INDEX IF NOT EXISTS org_order_services_org_name_idx
  ON org_order_services (organization_id, name);

-- Trim dead read indexes on the write-only agent directory. The table and
-- its (organization_id) index stay; nothing reads email/phone indexes.
DROP INDEX IF EXISTS org_agents_org_email_idx;
DROP INDEX IF EXISTS org_agents_org_phone_idx;
