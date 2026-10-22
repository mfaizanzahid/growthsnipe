-- Product rename: default portal name follows the product.
-- Only touches rows still carrying a legacy default; custom names are kept.
UPDATE app_settings
SET value = 'Fieldvisory', updated_at = CAST(strftime('%s', 'now') AS INTEGER)
WHERE key = 'portal_name' AND value IN ('Business Sidekick', 'SaaS Billing Portal', 'Billing Portal');
