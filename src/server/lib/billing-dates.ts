/**
 * Pure billing-date math for manual subscription schedules.
 * Carried over from the prior manual-schedule engine (no gateway coupling).
 * All values are UTC seconds.
 */

/** Parse "YYYY-MM-DD" to UTC midnight seconds; defaults to today. */
export function parseStartDateUtc(startDate?: string): number {  if (typeof startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    const ms = Date.parse(`${startDate}T00:00:00.000Z`);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }
  const d = new Date();
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000);
}

/** Advance a billing date by `months` calendar months, clamping end-of-month. */
export function addMonthsPreservingDay(fromSec: number, months: number): number {
  const d = new Date(fromSec * 1000);
  const day = d.getUTCDate();
  const targetMonthIndex = d.getUTCMonth() + Math.max(0, Math.floor(months));
  const year = d.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const month = targetMonthIndex % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.floor(Date.UTC(year, month, Math.min(day, lastDay)) / 1000);
}

/** Advance a billing date by one cycle of `interval` ("month" | "year"). */export function advanceBillingDate(
  fromSec: number,
  interval: string,
  intervalCount: number,
): number {
  const count = Math.max(1, Math.floor(intervalCount) || 1);
  switch (interval.toLowerCase()) {
    case "year":
    case "yearly":
    case "annual":
      return addMonthsPreservingDay(fromSec, count * 12);
    case "month":
    case "monthly":
    default:
      return addMonthsPreservingDay(fromSec, count);
  }
}

/** Move a billing date back by `months` calendar months (clamped end-of-month). */
export function subtractMonthsPreservingDay(fromSec: number, months: number): number {
  const d = new Date(fromSec * 1000);
  const day = d.getUTCDate();
  const targetMonthIndex = d.getUTCMonth() - Math.max(0, Math.floor(months));
  const year = d.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const month = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.floor(Date.UTC(year, month, Math.min(day, lastDay)) / 1000);
}

/**
 * Move a billing date back by one cycle (inverse of advanceBillingDate).
 * Recovers the current period start from nextCharge for proration.
 */export function retreatBillingDate(
  fromSec: number,
  interval: string,
  intervalCount: number,
): number {
  const count = Math.max(1, Math.floor(intervalCount) || 1);
  switch (interval.toLowerCase()) {
    case "year":
    case "yearly":
    case "annual":
      return subtractMonthsPreservingDay(fromSec, count * 12);
    case "month":
    case "monthly":
    default:
      return subtractMonthsPreservingDay(fromSec, count);
  }
}

/** Floor UTC seconds to UTC midnight (period anchor for a given moment). */
export function utcMidnight(fromSec: number): number {
  const d = new Date(fromSec * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000);
}
