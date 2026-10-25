-- Drop the raw vendor payload column: up to 20KB per order, never read by
-- any query, and the dominant share of warehouse storage. Canonical fields
-- plus live detail re-reads cover every current and planned use; per-service
-- fee amounts stay out until a vendor exposes them with verified units.
ALTER TABLE org_orders DROP COLUMN raw_json;
