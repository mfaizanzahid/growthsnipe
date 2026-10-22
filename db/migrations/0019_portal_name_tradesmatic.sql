-- Product rebrand: default portal name follows the product (Fieldvisory -> Tradesmatic).
-- Only touches rows still carrying the old default; custom names are kept.
UPDATE app_settings
SET value = 'Tradesmatic', updated_at = CAST(strftime('%s', 'now') AS INTEGER)
WHERE key = 'portal_name' AND value = 'Fieldvisory';
