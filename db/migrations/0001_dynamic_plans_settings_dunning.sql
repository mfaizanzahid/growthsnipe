-- Dynamic plans, portal settings, fallback priority, dunning state.
-- Plans: yearly price is explicit (annual_minor), plus trial/description/order.
ALTER TABLE plans ADD COLUMN trial_period_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN description TEXT;
ALTER TABLE plans ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE plans SET trial_period_days = 0 WHERE trial_period_days IS NULL;
UPDATE plans SET sort_order = CASE id WHEN 'launch' THEN 1 WHEN 'growth' THEN 2 ELSE 0 END;

-- Portal settings (superadmin-managed).
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO app_settings (key, value, updated_at)
VALUES
  ('portal_name', 'SaaS Billing Portal', 1756857600),
  ('support_email', 'support@tradesmatic.com', 1756857600);

-- Payment-method fallback order.
ALTER TABLE payment_methods ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;

-- Subscription past-due tracking (suspended, data retained; no auto-cancel).
ALTER TABLE org_subscriptions ADD COLUMN past_due_since INTEGER;

-- Invoice dunning state (day 0/2/4/6 + final day 7 schedule).
ALTER TABLE invoices ADD COLUMN reminder_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN last_reminder_at INTEGER;
