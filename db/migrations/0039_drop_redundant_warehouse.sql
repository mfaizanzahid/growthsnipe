-- Drop write-only / redundant warehouse structures to cut D1 write volume.
-- org_agents is write-only (leaderboards derive read-time from org_orders);
-- org_orders_org_status_idx is superseded by org_status_sched_idx;
-- org_orders_org_scheduled_idx is covered by org_sched_id_idx for every
-- range consumer; org_order_inspectors_org_order_idx duplicates the
-- table's (organization_id, order_id, ...) primary-key prefix.
DROP INDEX IF EXISTS org_orders_org_status_idx;
DROP INDEX IF EXISTS org_orders_org_scheduled_idx;
DROP INDEX IF EXISTS org_order_inspectors_org_order_idx;
DROP TABLE IF EXISTS org_agents;
