import { describe, expect, it } from "vitest";
import {
  OVERVIEW_CACHE_MAX_ENTRIES,
  overviewCacheKey,
  readCachedOverview,
  writeCachedOverview,
  type OverviewCacheStore,
} from "../src/react-app/lib/overview-cache";

function memoryStore(): OverviewCacheStore & { keys(): string[] } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

/** Store with a byte quota; setItem beyond it throws like sessionStorage. */
function quotaStore(quotaBytes: number): OverviewCacheStore & { used(): number } {
  const inner = memoryStore();
  let used = 0;
  return {
    getItem: inner.getItem,
    removeItem: (k) => {
      const v = inner.getItem(k);
      if (v !== null) used -= v.length;
      inner.removeItem(k);
    },
    setItem: (k, v) => {
      const prev = inner.getItem(k);
      const next = used - (prev?.length ?? 0) + v.length;
      if (next > quotaBytes) throw new Error("QuotaExceededError");
      used = next;
      inner.setItem(k, v);
    },
    used: () => used,
  };
}

describe("overview session cache", () => {
  it("misses on empty, round-trips on write", () => {
    const store = memoryStore();
    expect(readCachedOverview(store, "o1", "2026-01-01", "2026-02-01")).toBeNull();
    writeCachedOverview(store, "o1", "2026-01-01", "2026-02-01", { totals: { jobs: 3 } });
    expect(readCachedOverview(store, "o1", "2026-01-01", "2026-02-01")).toEqual({ totals: { jobs: 3 } });
  });

  it("scopes entries by org and range", () => {
    const store = memoryStore();
    writeCachedOverview(store, "o1", "2026-01-01", "2026-02-01", { v: 1 });
    expect(readCachedOverview(store, "o2", "2026-01-01", "2026-02-01")).toBeNull();
    expect(readCachedOverview(store, "o1", "2026-02-01", "2026-03-01")).toBeNull();
    expect(overviewCacheKey("o1", "a", "b")).not.toBe(overviewCacheKey("o1", "a", "c"));
  });

  it("treats corrupt entries as a miss", () => {
    const store = memoryStore();
    store.setItem(overviewCacheKey("o1", "a", "b"), "{not json");
    expect(readCachedOverview(store, "o1", "a", "b")).toBeNull();
    store.setItem(overviewCacheKey("o1", "a", "b"), "42");
    expect(readCachedOverview(store, "o1", "a", "b")).toBeNull();
  });

  it("evicts oldest entries past the cap", () => {
    const store = memoryStore();
    for (let i = 0; i < OVERVIEW_CACHE_MAX_ENTRIES + 5; i += 1) {
      writeCachedOverview(store, "o1", `2026-01-${String(i + 1).padStart(2, "0")}`, "2026-12-31", { i });
    }
    expect(readCachedOverview(store, "o1", "2026-01-01", "2026-12-31")).toBeNull();
    expect(readCachedOverview(store, "o1", "2026-01-30", "2026-12-31")).toEqual({ i: 29 });
  });

  it("recovers from quota by clearing and retrying once", () => {
    const store = quotaStore(400);
    writeCachedOverview(store, "o1", "2026-01-01", "2026-02-01", { pad: "x".repeat(300) });
    // Second range no longer fits: the write clears and stores only the newest.
    writeCachedOverview(store, "o1", "2026-03-01", "2026-04-01", { pad: "y".repeat(300) });
    expect(readCachedOverview(store, "o1", "2026-03-01", "2026-04-01")).toEqual({ pad: "y".repeat(300) });
    expect(readCachedOverview(store, "o1", "2026-01-01", "2026-02-01")).toBeNull();
  });

  it("is a no-op without storage", () => {
    expect(readCachedOverview(null, "o1", "a", "b")).toBeNull();
    expect(() => writeCachedOverview(null, "o1", "a", "b", {})).not.toThrow();
  });
});
