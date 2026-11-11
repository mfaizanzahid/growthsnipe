/**
 * Shared credit-coupon date helpers. Coupon expiries are stored as Unix
 * seconds and always expire at the end of the UTC day shown to the buyer.
 */

/** End of the UTC day containing the given Unix second. */
export function endOfDayUtc(seconds: number): number {
  const date = new Date(seconds * 1000);
  return Math.floor(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
    ) / 1000,
  );
}

/** Expiry timestamp for a coupon issued at `anchorMs`, in whole days. */
export function couponExpiryFromDays(anchorMs: number, days: number): number {
  const anchorSeconds = Math.floor(anchorMs / 1000);
  return endOfDayUtc(anchorSeconds + days * 86400);
}

/** The exact date a buyer sees, e.g. "December 9, 2026". */
export function formatCreditExpiry(validUntil: number | null | undefined): string {
  if (!validUntil) return "";
  return new Date(validUntil * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
