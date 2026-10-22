-- Track which billing period a pre-renewal reminder was sent for
-- (prevents resending while the date stays within the 2-day window).
ALTER TABLE org_subscriptions ADD COLUMN renewal_reminder_for INTEGER;
