-- O(1) enrichment coverage counters on the sync state row.
--
-- The status endpoint served coverage from a per-poll COUNT(DISTINCT ...)
-- scan over org_orders + org_order_services. Past ~30k orders that scan
-- exceeds the 10ms Worker CPU budget on the free plan and the poll 503s
-- (exceededCpu). The writers now maintain these counters incrementally, so
-- status reads one indexed row and runs zero aggregates.
--
-- orders_total mirrors total_fetched (set on the same state writes, zero
-- extra queries). It therefore INCLUDES cancelled orders, while the old
-- scan excluded them: the banner denominator is marginally larger.
-- orders_with_services counts orders carrying service rows (the no-charge
-- marker counts as resolved, same as the old scan). Both only grow via the
-- sync writers; manual SQL purges bypass them (a reseed resets both, same
-- as total_fetched).
ALTER TABLE org_sync_state ADD COLUMN orders_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE org_sync_state ADD COLUMN orders_with_services INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows from the warehouse (D1 executes this server-side;
-- no Worker CPU involved, unlike the per-poll scan this replaces).
UPDATE org_sync_state SET orders_total = (
  SELECT COUNT(DISTINCT o.id) FROM org_orders o
  WHERE o.organization_id = org_sync_state.organization_id
    AND o.status != 'cancelled'
);
UPDATE org_sync_state SET orders_with_services = (
  SELECT COUNT(DISTINCT o.id) FROM org_orders o
  WHERE o.organization_id = org_sync_state.organization_id
    AND o.status != 'cancelled'
    AND EXISTS (
      SELECT 1 FROM org_order_services s
      WHERE s.organization_id = o.organization_id AND s.order_id = o.id
    )
);
