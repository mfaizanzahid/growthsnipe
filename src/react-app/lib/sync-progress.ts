/** Seeding progress math for the dashboard headline (pure, unit-tested). */

export interface SeedProgressInput {
  totalFetched?: number | null;
  seedStartedAt?: number | null;
  totalEstimate?: number | null;
  /** Cap-aware walk position: chunks done of the fixed backfill walk. */
  backfillChunksDone?: number | null;
  backfillChunksTotal?: number | null;
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
 * Seeding progress line: elapsed plus a determinate percent. The percent
 * comes from backfill walk position (chunks done of the fixed 5-year walk),
 * never from rows over the vendor all-time total: the warehouse only pulls
 * 5 years, so a rows-based percent stalls below 100% on deep histories.
 * Chunk sizes vary wildly, so there is deliberately no time-left ETA.
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
  const bits = [`${formatCount(fetched)} orders synced`];
  if (elapsedText) bits.push(elapsedText);
  let pct: number | null = null;
  const chunksTotal =
    typeof sync.backfillChunksTotal === "number" && sync.backfillChunksTotal > 0 ? sync.backfillChunksTotal : null;
  const chunksDone =
    chunksTotal !== null && typeof sync.backfillChunksDone === "number"
      ? Math.max(0, Math.min(chunksTotal, sync.backfillChunksDone))
      : null;
  if (chunksTotal !== null && chunksDone !== null) {
    pct = Math.round((chunksDone / chunksTotal) * 100);
  } else {
    const total = typeof sync.totalEstimate === "number" && sync.totalEstimate > 0 ? sync.totalEstimate : null;
    if (total !== null) {
      pct = Math.min(100, Math.round((fetched / total) * 100));
      if (rate !== null && rate > 0 && fetched < total) {
        const leftMin = Math.ceil((total - fetched) / rate);
        bits.push(leftMin <= 1 ? "less than a minute left" : `about ${leftMin} min left`);
      }
    } else if (rateText) {
      bits.push(rateText);
    }
  }
  return { line: bits.join(" · "), pct };
}
