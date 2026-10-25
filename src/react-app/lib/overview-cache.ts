/**
 * Aggressive session cache for the dashboard overview.
 *
 * Within one tab session the overview for an exact (org, from, to) range is
 * served from sessionStorage: page reloads never refetch. Fresh data arrives
 * only through explicit user actions (the Refresh button, Sync, target
 * saves), which bypass the cache. Switching back to a previously viewed
 * preset is instant because each range keeps its own entry.
 *
 * Storage is injected (sessionStorage in the component, a fake in tests)
 * because this repo has no DOM test environment. Entries carry a versioned
 * key prefix so future shape changes cannot serve stale payloads.
 */

export const OVERVIEW_CACHE_PREFIX = "gsnipe:overview:v1:";
const INDEX_KEY = `${OVERVIEW_CACHE_PREFIX}index`;
/** Upper bound on cached ranges; oldest entries are evicted first. */
export const OVERVIEW_CACHE_MAX_ENTRIES = 25;

export interface OverviewCacheStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** sessionStorage access itself can throw (blocked cookies); null means uncached. */
export function sessionCacheStore(): OverviewCacheStore | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

export function overviewCacheKey(orgId: string, from: string, to: string): string {
  return `${OVERVIEW_CACHE_PREFIX}${orgId}:${from}:${to}`;
}

function readIndex(store: OverviewCacheStore): string[] {
  try {
    const raw = store.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function touchIndex(store: OverviewCacheStore, key: string): void {
  const next = [...readIndex(store).filter((k) => k !== key), key];
  const evicted = next.splice(0, Math.max(0, next.length - OVERVIEW_CACHE_MAX_ENTRIES));
  for (const k of evicted) {
    try {
      store.removeItem(k);
    } catch {
      // Eviction is best-effort; a stuck entry just costs quota.
    }
  }
  try {
    store.setItem(INDEX_KEY, JSON.stringify(next));
  } catch {
    // Index loss only disables future eviction, never reads.
  }
}

export function readCachedOverview<T>(store: OverviewCacheStore | null, orgId: string, from: string, to: string): T | null {
  if (!store) return null;
  try {
    const raw = store.getItem(overviewCacheKey(orgId, from, to));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return (parsed as { overview?: T }).overview ?? null;
  } catch {
    return null;
  }
}

export function writeCachedOverview(store: OverviewCacheStore | null, orgId: string, from: string, to: string, overview: unknown): void {
  if (!store) return;
  const key = overviewCacheKey(orgId, from, to);
  const entry = JSON.stringify({ savedAt: Date.now(), overview });
  try {
    store.setItem(key, entry);
    touchIndex(store, key);
    return;
  } catch {
    // Quota: drop every entry of ours and retry once, then give up silently.
  }
  for (const k of readIndex(store)) {
    try {
      store.removeItem(k);
    } catch {
      // Best-effort.
    }
  }
  try {
    store.removeItem(INDEX_KEY);
    store.setItem(key, entry);
    touchIndex(store, key);
  } catch {
    // Uncached this session; the next explicit refresh retries.
  }
}
