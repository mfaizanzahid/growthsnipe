-- Trial-first billing model: Starter/Pro plans, trial tracking, plan limits.
--
-- 1. Plans carry limits: max_users (NULL = unlimited), allow_briefings (1/0).
-- 2. Seed plans become Starter ($19/mo, $190/yr) and Pro ($29/mo, $290/yr),
--    no setup fee, no plan-level trial (trial is subscription-level, Pro tier).
--    Old seeds are removed only where no subscription references them.
-- 3. Subscriptions track the 30-day Pro trial window + sent reminder offsets.

ALTER TABLE plans ADD COLUMN max_users INTEGER;
ALTER TABLE plans ADD COLUMN allow_briefings INTEGER NOT NULL DEFAULT 1;

DELETE FROM plans
WHERE id IN ('launch', 'growth')
  AND NOT EXISTS (SELECT 1 FROM org_subscriptions WHERE org_subscriptions.plan_id = plans.id);

INSERT OR IGNORE INTO plans
  (id, name, monthly_minor, annual_minor, setup_fee_minor, trial_period_days, description, sort_order, currency, active, max_users, allow_briefings, created_at, updated_at)
VALUES
  ('starter', 'Starter', 1900, 19000, 0, 0, 'For solo operators.', 1, 'USD', 1, 1, 0, 1756857600, 1756857600),
  ('pro', 'Pro', 2900, 29000, 0, 0, 'For growing businesses.', 2, 'USD', 1, NULL, 1, 1756857600, 1756857600);

ALTER TABLE org_subscriptions ADD COLUMN trial_ends_at INTEGER;
ALTER TABLE org_subscriptions ADD COLUMN trial_reminders TEXT NOT NULL DEFAULT '[]';
