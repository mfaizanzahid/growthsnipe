-- GrowthSnipe rebrand: SNIPE Intelligence is the single self-serve plan.
--
-- 1. Plans can be contact-only: shown on the pricing page, never purchasable.
-- 2. SNIPE Intelligence is the only self-serve plan ($199/mo). The rest of the
--    GrowthSnipe offer ladder is contact-only and renders no price.
-- 3. Legacy Starter/Pro seeds are archived (existing subscriptions keep working).
-- 4. Portal name + support email follow the new brand.

ALTER TABLE plans ADD COLUMN contact_only INTEGER NOT NULL DEFAULT 0;

UPDATE plans
SET active = 0, updated_at = CAST(strftime('%s', 'now') AS INTEGER)
WHERE id IN ('starter', 'pro');

INSERT OR IGNORE INTO plans
  (id, name, monthly_minor, annual_minor, setup_fee_minor, trial_period_days, description, sort_order, currency, active, max_users, allow_briefings, contact_only, features, created_at, updated_at)
VALUES
  ('snipe-intelligence', 'SNIPE Intelligence™', 19900, 199000, 0, 0,
   'One weekly scorecard, forecasting, and custom reporting built from your booking software, CRM, phones, and ad accounts.',
   1, 'USD', 1, NULL, 0, 0,
   'One weekly scorecard, Forecasting and custom reports, Spectora and ISN connections, Call and ad performance, 30-day free trial, Cancel anytime',
   1756857600, 1756857600),
  ('loop-library', 'Loop Library', 0, 0, 0, 0,
   'Platform-specific automation recipes and scripts your team can run.',
   2, 'USD', 1, NULL, 0, 1,
   'Platform-specific automation recipes, Script library, Repeatable playbooks',
   1756857600, 1756857600),
  ('snipe-diagnostic', 'Snipe Diagnostic', 0, 0, 0, 0,
   'A 12-month data teardown with a Leak Map and a live readout.',
   3, 'USD', 1, NULL, 0, 1,
   '12-month data teardown, Leak Map, Live readout',
   1756857600, 1756857600),
  ('snipe-blueprint', 'Snipe Blueprint', 0, 0, 0, 0,
   'The full growth plan, presented within 10 business days.',
   4, 'USD', 1, NULL, 0, 1,
   'Full growth plan, 10-business-day delivery, Channel Math Model, Capacity Trigger Ladder',
   1756857600, 1756857600),
  ('engine-core', 'SNIPE Engine Core', 0, 0, 0, 0,
   'We launch the system in 21 days, then run it with your team answering first.',
   5, 'USD', 1, NULL, 1, 1,
   'All 8 Revenue Loops, 21-day launch runway, Voice AI 24/7 fallback, Up to $3K monthly ad spend managed, SNIPE Intelligence™ included, SNIPE VoiceIQ™ included',
   1756857600, 1756857600),
  ('engine-command', 'SNIPE Engine Command', 0, 0, 0, 0,
   'The full system with our live intake team and a dedicated Pod Lead.',
   6, 'USD', 1, NULL, 1, 1,
   'All 8 Revenue Loops plus custom, Live intake team, Dedicated Pod Lead, Weekly strategy calls, Up to $10K monthly ad spend managed, SNIPE Intelligence™ included, SNIPE VoiceIQ™ included',
   1756857600, 1756857600);

UPDATE app_settings
SET value = 'GrowthSnipe', updated_at = CAST(strftime('%s', 'now') AS INTEGER)
WHERE key = 'portal_name' AND value IN ('Tradesmatic', 'Fieldvisory', 'Business Sidekick', 'SaaS Billing Portal', 'Billing Portal');

UPDATE app_settings
SET value = 'support@growthsnipe.com', updated_at = CAST(strftime('%s', 'now') AS INTEGER)
WHERE key = 'support_email' AND value IN ('support@tradesmatic.com', 'support@example.com');
