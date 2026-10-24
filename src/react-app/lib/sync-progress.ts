/** Seeding progress math for the dashboard headline (pure, unit-tested). */

export interface SeedProgressInput {
  totalFetched?: number | null;
  seedStartedAt?: number | null;
  totalEstimate?: number | null;
}

/** Compact whole-number formatting for sync counters (12,400 not 12,400.0). */
export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

/**
 * Whether the seeding section stays visible. Hides the moment the seed is
 * live, or earlier when the fetched count already covers the vendor total —
 * no waiting on the status flip for data that is demonstrably complete.
 */
export function isSeedComplete(sync: SeedProgressInput & { state?: string }): boolean {
  if (sync.state === "live") return true;
  const total = typeof sync.totalEstimate === "number" && sync.totalEstimate > 0 ? sync.totalEstimate : null;
  return total !== null && (sync.totalFetched ?? 0) >= total;
}

/**
 * Whether Sync now stays disabled: a seed is actively progressing when the
 * state is backfilling with a fresh heartbeat (checkpoints refresh it every
 * chunk). Stalled backfills (old heartbeat) and post-click grace keep the
 * manual rescue path open, so dev seeds without a cron can always resume.
 */
export function isSyncDisabled(input: {
  state?: string;
  lastSyncedAt?: number | null;
  refreshing: boolean;
  lastManualAtSec: number | null;
  nowSec: number;
}): boolean {
  if (input.refreshing) return true;
  if (input.state !== "backfilling") return false;
  if (input.lastManualAtSec !== null && input.nowSec - input.lastManualAtSec < 90) return false;
  return input.lastSyncedAt != null && input.nowSec - input.lastSyncedAt < 300;
}

/**
 * Seeding progress line: elapsed, current rate, and an ETA only when the
 * vendor total is known. Rates and ETAs are approximate by nature (vendor
 * windows vary in size); the wording says "about" and never promises.
 */
export function seedingStats(
  sync: SeedProgressInput,
  nowSec: number = Math.floor(Date.now() / 1000),
): { line: string; pct: number | null } {
  const fetched = sync.totalFetched ?? 0;
  const elapsedSec = sync.seedStartedAt ? Math.max(1, nowSec - sync.seedStartedAt) : null;
  const elapsedMin = elapsedSec === null ? null : Math.floor(elapsedSec / 60);
  const elapsedText = elapsedMin === null ? null : elapsedMin < 1 ? "just started" : `${elapsedMin} min so far`;
  const rate = elapsedSec === null || elapsedSec <= 0 ? null : fetched / (elapsedSec / 60);
  const rateText = rate === null || !Number.isFinite(rate) ? null : `about ${formatCount(rate)}/min`;
  const total = typeof sync.totalEstimate === "number" && sync.totalEstimate > 0 ? sync.totalEstimate : null;
  const bits = [`${formatCount(fetched)} orders synced`];
  if (elapsedText) bits.push(elapsedText);
  let pct: number | null = null;
  if (total !== null) {
    pct = Math.min(100, Math.round((fetched / total) * 100));
    if (rate !== null && rate > 0 && fetched < total) {
      const leftMin = Math.ceil((total - fetched) / rate);
      bits.push(leftMin <= 1 ? "less than a minute left" : `about ${leftMin} min left`);
    }
  } else if (rateText) {
    bits.push(rateText);
  }
  return { line: bits.join(" · "), pct };
}
