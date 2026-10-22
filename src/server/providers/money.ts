/**
 * Provider money normalization.
 *
 * Vendor APIs report amounts in **major units** (dollars), sometimes as
 * strings: Spectora `quote` ("450.0"), ISN `totalfee` ("987.53"). Every other
 * money value in this app is integer minor units (cents) — invoices, plans,
 * transactions — so canonical order totals are converted at the adapter
 * boundary. Mixing the two silently under-reports revenue by 100x, so this is
 * the single place the conversion happens.
 */

const MINOR_PER_MAJOR = 100;

/**
 * Convert a major-unit amount (number or numeric string) to integer minor
 * units. Returns undefined for anything non-numeric or negative rather than
 * guessing — a missing total must not become $0 in a briefing.
 */
export function toMinorUnits(major: unknown): number | undefined {
  if (major === null || major === undefined) return undefined;
  if (typeof major === 'number') {
    return Number.isFinite(major) && major >= 0 ? Math.round(major * MINOR_PER_MAJOR) : undefined;
  }
  if (typeof major !== 'string') return undefined;
  // Tolerate grouping separators and stray whitespace only; no currency symbols
  // or accounting negatives, which no provider returns.
  const cleaned = major.trim().replace(/,/g, '');
  if (cleaned === '') return undefined;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * MINOR_PER_MAJOR);
}

/** Sum minor-unit amounts, ignoring undefined entries. */
export function sumMinor(values: Array<number | undefined>): number {
  let total = 0;
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) total += v;
  }
  return total;
}