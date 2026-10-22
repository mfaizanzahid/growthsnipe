-- Shorten seed plan descriptions to audience-only blurbs.
-- Only touches rows still carrying the old seed text; custom values are kept.
UPDATE plans
SET description = 'For solo operators.', updated_at = CAST(strftime('%s', 'now') AS INTEGER)
WHERE id = 'starter' AND description = 'For solo operators: 1 user, core dashboard and AI access.';

UPDATE plans
SET description = 'For growing businesses.', updated_at = CAST(strftime('%s', 'now') AS INTEGER)
WHERE id = 'pro' AND description = 'For growing businesses: unlimited users and scheduled briefings.';
