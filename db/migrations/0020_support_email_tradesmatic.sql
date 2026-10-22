-- Support contact: default email follows the product domain (Tradesmatic).
-- Only touches the row still carrying the old default; custom values are kept.
UPDATE app_settings
SET value = 'support@tradesmatic.com', updated_at = CAST(strftime('%s', 'now') AS INTEGER)
WHERE key = 'support_email' AND value = 'support@example.com';