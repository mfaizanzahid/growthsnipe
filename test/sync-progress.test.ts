import { describe, expect, it } from "vitest";
import { formatCount, isSeedComplete, isSyncDisabled, seedingStats } from "../src/react-app/lib/sync-progress";

const NOW = 1_791_000_000;

describe("seedingStats", () => {
  it("shows count, elapsed, rate, and ETA when the total is known", () => {
    // 12,000 fetched in 3 minutes of a 45,000 total: ~4,000/min, ~9 min left, 27%.
    const { line, pct } = seedingStats({ totalFetched: 12000, seedStartedAt: NOW - 180, totalEstimate: 45000 }, NOW);
    expect(line).toBe("12,000 orders synced · 3 min so far · about 9 min left");
    expect(pct).toBe(27);
  });

  it("clamps progress at 100 without promising more", () => {
    const { line, pct } = seedingStats({ totalFetched: 50000, seedStartedAt: NOW - 600, totalEstimate: 45000 }, NOW);
    expect(pct).toBe(100);
    expect(line).not.toContain("left");
  });

  it("shows rate instead of ETA when the total is unknown", () => {
    const { line, pct } = seedingStats({ totalFetched: 6400, seedStartedAt: NOW - 120, totalEstimate: null }, NOW);
    expect(line).toBe("6,400 orders synced · 2 min so far · about 3,200/min");
    expect(pct).toBeNull();
  });

  it("says just started within the first minute", () => {
    const { line } = seedingStats({ totalFetched: 300, seedStartedAt: NOW - 20, totalEstimate: null }, NOW);
    expect(line).toContain("just started");
  });

  it("degrades to counts only without a start time", () => {
    const { line, pct } = seedingStats({ totalFetched: 300, seedStartedAt: null, totalEstimate: null }, NOW);
    expect(line).toBe("300 orders synced");
    expect(pct).toBeNull();
  });

  it("says less than a minute when nearly done", () => {
    const { line } = seedingStats({ totalFetched: 44800, seedStartedAt: NOW - 600, totalEstimate: 45000 }, NOW);
    expect(line).toContain("less than a minute left");
  });

  it("prefers chunk walk position over the vendor all-time total", () => {
    // 10 of 21 chunks with a vendor total the 5-year scope can never reach:
    // percent follows the walk (48%), with no misleading ETA.
    const { line, pct } = seedingStats(
      { totalFetched: 20000, seedStartedAt: NOW - 600, totalEstimate: 45000, backfillChunksDone: 10, backfillChunksTotal: 21 },
      NOW,
    );
    expect(pct).toBe(48);
    expect(line).toBe("20,000 orders synced · 10 min so far");
  });

  it("clamps chunk position into range", () => {
    expect(
      seedingStats({ totalFetched: 1, backfillChunksDone: 99, backfillChunksTotal: 21 }, NOW).pct,
    ).toBe(100);
    expect(
      seedingStats({ totalFetched: 1, backfillChunksDone: -3, backfillChunksTotal: 21 }, NOW).pct,
    ).toBe(0);
  });
});

describe("formatCount", () => {
  it("renders whole numbers with grouping", () => {
    expect(formatCount(12400.7)).toBe("12,401");
  });
});

describe("isSeedComplete", () => {
  it("hides on live regardless of counts", () => {
    expect(isSeedComplete({ state: "live", totalFetched: 0, totalEstimate: 45000 })).toBe(true);
  });

  it("hides when fetched covers the estimate without waiting for the flip", () => {
    expect(isSeedComplete({ state: "backfilling", totalFetched: 45891, totalEstimate: 45891 })).toBe(true);
    expect(isSeedComplete({ state: "backfilling", totalFetched: 50000, totalEstimate: 45891 })).toBe(true);
  });

  it("stays visible while genuinely incomplete", () => {
    expect(isSeedComplete({ state: "backfilling", totalFetched: 40110, totalEstimate: 45891 })).toBe(false);
    expect(isSeedComplete({ state: "backfilling", totalFetched: 100, totalEstimate: null })).toBe(false);
  });
});

describe("isSyncDisabled", () => {
  const NOW = 1_791_000_000;

  it("disables while its own request is in flight", () => {
    expect(isSyncDisabled({ state: "live", refreshing: true, lastManualAtSec: null, nowSec: NOW })).toBe(true);
  });

  it("disables during an actively heartbeating backfill", () => {
    expect(
      isSyncDisabled({ state: "backfilling", lastSyncedAt: NOW - 60, refreshing: false, lastManualAtSec: null, nowSec: NOW }),
    ).toBe(true);
  });

  it("stays enabled for stalled backfills so seeds can be rescued manually", () => {
    expect(
      isSyncDisabled({ state: "backfilling", lastSyncedAt: NOW - 3600, refreshing: false, lastManualAtSec: null, nowSec: NOW }),
    ).toBe(false);
  });

  it("stays enabled right after your own click even with a fresh heartbeat", () => {
    expect(
      isSyncDisabled({ state: "backfilling", lastSyncedAt: NOW - 10, refreshing: false, lastManualAtSec: NOW - 30, nowSec: NOW }),
    ).toBe(false);
  });

  it("stays enabled outside backfilling", () => {
    expect(
      isSyncDisabled({ state: "live", lastSyncedAt: NOW - 10, refreshing: false, lastManualAtSec: null, nowSec: NOW }),
    ).toBe(false);
  });
});
