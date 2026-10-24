-- Seeding progress honesty: when a seed started and the vendor's grand total.
-- `seed_started_at` anchors elapsed-time and rate math for the dashboard ETA;
-- `total_estimate` (null = unknown, e.g. seeds that began before this column
-- existed) drives the determinate progress bar, clamped at 100%.
ALTER TABLE org_sync_state ADD COLUMN seed_started_at INTEGER;
ALTER TABLE org_sync_state ADD COLUMN total_estimate INTEGER;
