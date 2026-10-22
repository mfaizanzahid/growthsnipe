-- A trial the customer subscribed to DURING the trial window.
--
-- The first period is charged immediately, but the row keeps status 'trialing'
-- so the trial tier (Pro features) still applies until trial_ends_at. The row
-- already carries the paid plan/interval/amount, and next_charge is anchored
-- to trial_ends_at + one interval, so the renewal follows the trial.
--
-- 1 = prepaid trial (activate it when the trial ends), 0 = ordinary trial.
ALTER TABLE org_subscriptions ADD COLUMN trial_prepaid INTEGER NOT NULL DEFAULT 0;
