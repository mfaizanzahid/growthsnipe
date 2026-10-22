/**
 * Pure billing math (minor units, USD). No I/O, no gateway calls.
 * Every function is unit-tested in test/billing-math.test.ts.
 */

export interface CouponTerms {
  kind: "percent" | "fixed";
  percentOff?: number | null;
  amountOffMinor?: number | null;
  appliesToSetup?: number | null;
}

export interface SignupAmounts {
  setupMinor: number;
  recurringMinor: number;
  setupDiscountMinor: number;
  recurringDiscountMinor: number;
  discountTotalMinor: number;
  /** Amount the customer must pay now (never negative). */
  totalMinor: number;
}

/**
 * Signup totals per docs/agent-rules/07-discounts.md:
 * - discounts reduce recurring lines only, unless applies_to_setup
 * - percent applies per discounted line; fixed is capped at the discounted sum
 * - totals never below zero
 */
export function computeSignupAmounts(input: {
  setupMinor: number;
  recurringMinor: number;
  coupon?: CouponTerms | null;
}): SignupAmounts {
  const setupMinor = Math.max(0, Math.floor(input.setupMinor));
  const recurringMinor = Math.max(0, Math.floor(input.recurringMinor));
  const coupon = input.coupon ?? null;

  let setupDiscountMinor = 0;
  let recurringDiscountMinor = 0;

  if (coupon) {
    if (coupon.kind === "percent") {
      // Per discounted line (07-discounts): recurring always, setup only when enabled.
      const pct = Math.min(100, Math.max(0, Math.floor(coupon.percentOff ?? 0)));
      recurringDiscountMinor = Math.round((recurringMinor * pct) / 100);
      if (coupon.appliesToSetup) {
        setupDiscountMinor = Math.round((setupMinor * pct) / 100);
      }
    } else {
      // Fixed: capped at the discounted lines, recurring first, then setup.
      const base = recurringMinor + (coupon.appliesToSetup ? setupMinor : 0);
      const total = Math.min(Math.max(0, Math.floor(coupon.amountOffMinor ?? 0)), base);
      recurringDiscountMinor = Math.min(total, recurringMinor);
      const remainder = total - recurringDiscountMinor;
      if (coupon.appliesToSetup && remainder > 0) {
        setupDiscountMinor = Math.min(remainder, setupMinor);
      }
    }
  }

  const discountTotalMinor = setupDiscountMinor + recurringDiscountMinor;
  const totalMinor = Math.max(
    0,
    setupMinor + recurringMinor - discountTotalMinor,
  );
  return {
    setupMinor,
    recurringMinor,
    setupDiscountMinor,
    recurringDiscountMinor,
    discountTotalMinor,
    totalMinor,
  };
}

/**
 * Immediate upgrade charge: price difference × remaining fraction of the
 * current cycle, rounded. Returns 0 for downgrades, equal prices, or an
 * already-elapsed period.
 */
export function computeProration(input: {
  oldRecurringMinor: number;
  newRecurringMinor: number;
  periodStartSec: number;
  periodEndSec: number;
  nowSec: number;
}): number {
  const { oldRecurringMinor, newRecurringMinor, periodStartSec, periodEndSec, nowSec } = input;
  if (newRecurringMinor <= oldRecurringMinor) return 0;
  const periodSec = periodEndSec - periodStartSec;
  if (!(periodSec > 0)) return 0;
  const remainingSec = Math.min(Math.max(periodEndSec - nowSec, 0), periodSec);
  if (remainingSec <= 0) return 0;
  return Math.round((newRecurringMinor - oldRecurringMinor) * (remainingSec / periodSec));
}

/** Format the next human invoice number for a year. */
export function formatInvoiceNumber(year: number, sequence: number): string {
  return `INV-${year}-${String(sequence).padStart(4, "0")}`;
}

/**
 * Dunning gate for the daily Cron. Reminders go out on day 0 (at failure,
 * handled by the caller), days 2/4/6, and a final notice on day 7 — i.e. at
 * most 5 sends tracked by reminderCount. Gap is 2 days except the final
 * notice, which may go 1 day after the day-6 reminder.
 */
export function dunningDue(input: {
  reminderCount: number;
  lastReminderAtSec: number | null;
  nowSec: number;
}): boolean {
  const MAX_SENDS = 5;
  if (input.reminderCount >= MAX_SENDS) return false;
  if (input.reminderCount <= 0) return true;
  if (input.lastReminderAtSec === null) return true;
  const gap = input.reminderCount >= 4 ? 86400 : 2 * 86400;
  return input.nowSec - input.lastReminderAtSec >= gap;
}
