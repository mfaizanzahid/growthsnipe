# Recurring billing ownership — manual subscriptions only

There is exactly ONE subscription flow family: trial-first manual schedules owned by the Worker.

We do NOT use Safepay built-in subscriptions. There is no `sub_`/`plan_` hosted-subscribe path, no Safepay-owned recurrence, and no subscription webhook reconcile.

## Trial first

- First workspaces start a 30-day Pro trial via `POST /api/billing/trial/start`: no card, no charge, no invoice. Status `trialing`, `trial_ends_at` set, Pro-tier access.
- A daily Cron owns trialing rows: reminders at offsets −5/−3/0/+3/+5 days vs trial end (each once, `trial_reminders` ledger), and flips to `trial_expired` past the window.
- The renewal engine NEVER charges `trialing` rows (no method on file by construction).

## Paid start (subscribe)

- `POST /api/billing/subscribe` converts a trial (or starts paid for orgs that never trialed): plan + interval + coupon + card, first period charged immediately via Safepay Atoms + `unscheduled_cof` with a saved `pm_` token. Counts as cycle 1; `nextCharge` advances one interval from payment.
- Same session trust chain as signup (server-computed amounts, tracker success required).

## Subscribing during a trial (prepaid trial)

- The customer is charged the first period immediately, but the workspace stays on the **trial tier** (Pro features) until `trial_ends_at`. The paid plan starts then, and the renewal date follows the trial: `nextCharge = trial_ends_at + one interval`.
- The row keeps `status = 'trialing'` and carries `trial_prepaid = 1`; it already holds the paid plan, interval, amount and card. `cycles_charged = 1` (the period they paid for).
- `orgAccess` resolves a prepaid trial without waiting for the Cron: trial tier up to `trial_ends_at`, then the paid plan's limits. A paying customer is never locked out waiting for the 03:00 flip.
- The daily Cron flips a prepaid trial to `active` (clearing `trial_prepaid` and `trial_ends_at`) and enforces the paid plan's limits with **downgrade semantics** (no reactivation). A plain trial still flips to `trial_expired`.
- A prepaid trial gets **no trial reminders** (the customer already paid) and no "your trial ended" nag — it gets the standard "subscription active" notice at the flip.
- A second workspace may be opened while the first workspace's trial is prepaid (the customer has paid). A canceled prepaid trial is blocked again.
- **Plan change is blocked (409) while the prepaid window is open** — proration would charge a second time for a period already paid. **Cancel is allowed**: the plan never starts and access continues until the end of the paid period.
- A failed webhook must not flip a trialing row to `past_due`: a trial has no renewal charge to fail.

## Manual schedule (the only path)

- Stored locally in `org_subscriptions` with `interval` (`month`/`year`), `intervalCount`, `totalCycles`, `startDate`, `nextCharge`, `defaultPaymentMethodId`, plus `trial_ends_at` and `trial_reminders`.
- Renewals run on a daily Cloudflare Cron. For each due row (`nextCharge <= now`, billable status, cycles cap not reached) the Worker tries payment methods in order: primary (`is_default`) first, then backups by ascending `priority`. Each attempt is recorded as a transaction. The first success completes the period: invoice paid + `nextCharge` advanced by one interval, and a succeeding backup is auto-promoted to primary. Failed methods are marked `failed` (visible as failed in UI); a later success returns the method to `active`.
- Removing a method is allowed only while more than one VALID method remains; the primary cannot be removed without promoting another first.
- Manual retry (org `admin` or `superadmin`): charges ONLY the selected method for a due/failed invoice. Idempotent per invoice attempt, short cooldown.
- Auto-retry cap (per card, not per invoice): the daily Cron retries every saved card — valid or failed — with at most one attempt per card per day and at most 3 attempts per card per overdue invoice (initial + 2 retries), at least 24h apart. Attempts are attributed via `transactions.payment_method_id`. A newly added card gets its own budget. When no card has budget left, the invoice waits for manual pay only (user "Retry with primary card" button or superadmin support retry — manual pay may target a failed card and reactivates it on success).
- Dunning (all methods fail for a period): invoice stays unpaid, subscription goes `past_due` (suspended, data retained). Reminders to org admins: day 0 failure notice, days 2/4/6, final notice day 7. Reminders stop on payment. Dunning emails keep sending on schedule even after auto-retries are exhausted.
- Past-due endgame: 20 days overdue → "account closes in 5 days" warning (once, marked by invoice `reminderCount=6`); 25 days overdue → subscription auto-cancels (`canceled`, access suspended, data retained) + canceled + account-cancelled emails.
- `cancel` stops the Cron locally (status `canceled`). There is no Safepay subscription-cancel call in this model.

## Forbidden

- Cloudflare Cron charging anything except manual `org_subscriptions`.
- Charging a `trialing` row, or any period without a saved method.
- Any Safepay native-subscription create/retrieve/cancel call.
- Charging the same period twice (guard via idempotency keys + advance-after-success).
