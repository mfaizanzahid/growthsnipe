-- Reprice seed plans (owner decision): Starter $9/mo $90/yr, Pro $14/mo $140/yr.
-- Plan rows are what renewals and new subscribes price from, so future
-- charges use these values going forward. No other plan fields change.
UPDATE plans
SET monthly_minor = 900,
    annual_minor = 9000,
    updated_at = CAST(strftime('%s', 'now') AS INTEGER)
WHERE id = 'starter';
UPDATE plans
SET monthly_minor = 1400,
    annual_minor = 14000,
    updated_at = CAST(strftime('%s', 'now') AS INTEGER)
WHERE id = 'pro';
