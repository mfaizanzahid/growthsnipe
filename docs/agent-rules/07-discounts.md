# Discounts & coupons

Superadmin-managed, Stripe-style. Tables: `coupons`, `coupon_plans`, `subscription_coupons`.

## Coupon fields

- `code`: uppercase, unique. Client types it at signup; superadmin can also attach one to a subscription.
- `kind`: `percent` (1–100 in `percent_off`) or `fixed` (`amount_off_minor`, USD).
- `duration`: `once` (first invoice only) | `repeating` (`duration_cycles` N) | `forever`.
- `applies_to_setup`: 0 by default — discounts reduce recurring lines only. When 1, they also reduce the setup fee line.
- `max_redemptions` / `redeemed_count`, `valid_from` / `valid_until`, `active` flag.

## Applicability

- No `coupon_plans` rows = valid for ALL active plans. Otherwise valid only for listed plan ids.
- A coupon is redeemable only when: `active=1`, now within `[valid_from, valid_until]` (null = open), `redeemed_count < max_redemptions` (null = unlimited), and the plan is applicable.

## Application math (all in minor units)

- Percent: `discount = round(line * percent / 100)` per discounted line.
- Fixed: `discount = min(amount_off, sum of discounted lines)` — spread across lines, never driving the invoice total below zero.
- Discounts render as NEGATIVE `invoice_items` rows so invoices stay auditable.
- Stacking: one coupon per subscription (simplest correct). A second coupon replaces the first only if explicitly re-assigned by superadmin.
- Trials: coupons stack with trials (discount applies to the first charged period, whenever it bills).

## Lifecycle

- Attaching a coupon creates a `subscription_coupons` row (`cycles_applied=0`). Each billed period increments it; when a `repeating` coupon exhausts its cycles its status becomes `exhausted` and it stops applying. `forever` never exhausts.
- `redeemed_count` increments once per subscription attach (not per cycle), guarded by the same idempotency key as the signup charge.
- Deactivating a coupon stops NEW redemptions; already-attached `subscription_coupons` keep their schedule.
