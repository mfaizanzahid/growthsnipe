-- Recompute orders_total as the non-cancelled count.
--
-- Between 0040 and the delta-maintenance change, checkpoints mirrored
-- orders_total from total_fetched (which INCLUDES cancelled rows), so live
-- rows currently carry an inflated total. The writers now maintain the
-- column via atomic deltas that exclude cancelled orders (new rows count
-- unless cancelled, status transitions adjust), matching the 0040 backfill
-- semantics — recompute the base server-side so the deltas start exact.
-- orders_with_services was only ever bumped and stays valid; it is not
-- touched here.
UPDATE org_sync_state SET orders_total = (
  SELECT COUNT(DISTINCT o.id) FROM org_orders o
  WHERE o.organization_id = org_sync_state.organization_id
    AND o.status != 'cancelled'
);
