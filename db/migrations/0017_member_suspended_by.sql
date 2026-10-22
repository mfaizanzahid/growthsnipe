-- Member suspension provenance: plan_limits (auto, restorable on upgrade) vs
-- admin (manual, never auto-restored). NULL = unknown/legacy, fail-closed
-- (never auto-reactivated).
ALTER TABLE members ADD COLUMN suspended_by TEXT;
