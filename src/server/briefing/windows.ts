import { partsInZone, zonedWallClockToUtc } from '../lib/local-time';
import { cadenceSpec } from './cadence';

/**
 * Analysis windows for a briefing.
 *
 * Windows are aligned to **local midnight** in the workspace's timezone rather
 * than to "now". Two reasons:
 *  - A 07:00 daily briefing should describe yesterday, not the seven hours since
 *    midnight.
 *  - ISN coerces every date filter to `YYYY-MM-DD`, so day-aligned windows map
 *    cleanly onto a provider that cannot express sub-day precision.
 */
export interface AnalysisWindow {
  /** Inclusive lower bound (ISO 8601, UTC). */
  from: string;
  /** Exclusive upper bound (ISO 8601, UTC). */
  to: string;
  /** Days covered by this window. */
  days: number;
  /** "Yesterday", "Last 7 days", "Last 30 days". */
  label: string;
}

export interface BriefingWindows {
  current: AnalysisWindow;
  previous: AnalysisWindow | null;
}

const DAY_MS = 86_400_000;

/** Local midnight of the day containing `date`, as an absolute instant. */
function localMidnight(date: Date, timezone: string): Date {
  const p = partsInZone(date, timezone);
  return zonedWallClockToUtc(
    { year: p.year, month: p.month, day: p.day, hour: 0, minute: 0, second: 0 },
    timezone,
  );
}

function labelFor(days: number): string {
  if (days <= 1) return 'Yesterday';
  if (days === 7) return 'Last 7 days';
  return `Last ${days} days`;
}

/**
 * Build the current and previous analysis windows for a cadence.
 *
 * `now` is the moment the briefing runs. The current window always ends at the
 * most recent local midnight, so a briefing never reports on a partial day.
 */
export function briefingWindows(
  type: string | null | undefined,
  timezone: string,
  now: Date,
): BriefingWindows {
  const spec = cadenceSpec(type);
  const end = localMidnight(now, timezone);
  const days = spec.windowDays;

  const current: AnalysisWindow = {
    from: new Date(end.getTime() - days * DAY_MS).toISOString(),
    to: end.toISOString(),
    days,
    label: labelFor(days),
  };

  if (!spec.compare) return { current, previous: null };

  const previous: AnalysisWindow = {
    from: new Date(end.getTime() - 2 * days * DAY_MS).toISOString(),
    to: new Date(end.getTime() - days * DAY_MS).toISOString(),
    days,
    label: `Previous ${days === 1 ? 'day' : days === 7 ? '7 days' : `${days} days`}`,
  };

  return { current, previous };
}

/**
 * Day buckets inside a window, keyed `YYYY-MM-DD` in the workspace timezone.
 * Used for per-day series so trends and busy days are visible.
 */
export function dayBuckets(window: AnalysisWindow, timezone: string): string[] {
  const from = new Date(window.from).getTime();
  const to = new Date(window.to).getTime();
  const out: string[] = [];
  // Step by local day rather than 24h so DST days are not skipped or doubled.
  let cursor = from;
  let guard = 0;
  while (cursor < to && guard < 400) {
    const d = new Date(cursor);
    const p = partsInZone(d, timezone);
    out.push(
      `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`,
    );
    const nextMidnight = zonedWallClockToUtc(
      { year: p.year, month: p.month, day: p.day + 1, hour: 0, minute: 0, second: 0 },
      timezone,
    );
    const step = nextMidnight.getTime() - cursor;
    cursor += step > 0 ? step : DAY_MS;
    guard += 1;
  }
  return out;
}

/** Local day key for an instant, used to file an order into a bucket. */
export function bucketKeyFor(iso: string | undefined, timezone: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = partsInZone(d, timezone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}