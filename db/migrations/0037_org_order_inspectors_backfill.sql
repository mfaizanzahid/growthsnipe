-- Backfill the inspector junction for rows synced before 0036 created it.
--
-- inspector_names already holds splitPeople-normalized names (one JSON array
-- element per person, written by every sync upsert), so json_each reproduces
-- the sync-time fan-out exactly. The LIKE guard keeps one malformed legacy
-- row from aborting the whole backfill. Re-runnable: INSERT OR IGNORE skips
-- rows the sync (or a previous run) already fanned out.

INSERT OR IGNORE INTO org_order_inspectors (organization_id, order_id, inspector_name)
SELECT DISTINCT o.organization_id, o.id, trim(j.value)
FROM org_orders o, json_each(o.inspector_names) AS j
WHERE o.inspector_names LIKE '[%'
  AND j.value IS NOT NULL
  AND trim(j.value) <> '';
