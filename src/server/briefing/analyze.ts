import { sumMinor } from '../providers/money';
import type { OrderRecord } from '../providers/types';
import {
  MIN_CANCEL_RATE_SAMPLE,
  type BriefingMetrics,
  type DataQuality,
  type DayPoint,
  type Deltas,
  type InspectorLoad,
  type MixEntry,
  type WindowData,
} from './types';
import { bucketKeyFor } from './windows';

/**
 * Deterministic metric computation.
 *
 * Everything a briefing claims numerically is computed here, once, from fetched
 * records. The language model receives these numbers and narrates them; it
 * never derives a count itself. Anything we cannot compute is recorded in
 * `dataQuality.omissions` so the report says "we can't see X" instead of
 * quietly implying X is zero.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOP_MIX = 5;
const TOP_INSPECTORS = 8;

function normLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.replace(/\s+/g, ' ').trim();
  return v === '' ? null : v;
}

function isCancelled(o: OrderRecord): boolean {
  return String(o.status ?? '').toLowerCase() === 'cancelled';
}

function isCompleted(o: OrderRecord): boolean {
  return String(o.status ?? '').toLowerCase() === 'completed';
}

function pct(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Percentage change, or null when the baseline is unusable (0 / missing). */
export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (previous === 0) return null;
  return pct(((current - previous) / previous) * 100);
}

export function analyzeWindow(
  data: WindowData,
  timezone: string,
  asOf: Date,
  dayBuckets: string[],
): BriefingMetrics {
  const orders = data.orders;

  const completedOrders = orders.filter(isCompleted);
  const cancelledInSet = orders.filter(isCancelled).length;
  const completed = completedOrders.length;

  // Two different provider shapes, and conflating them silently understates the
  // window total (this bug shipped "0 cancellations, rate unavailable" for a
  // month that actually had a 8.8% cancellation rate):
  //
  //  - DISJOINT: the default listing excludes cancelled records, so the cancel
  //    filter is a separate population. Verified live on Spectora: of 103
  //    windowed records none carried `canceled_at`, while `filter[canceled]=true`
  //    returned 10 additional ones. Total = listed + cancelled.
  //  - SUBSET (or no filter at all): cancelled rows appear in the listing itself,
  //    so the provider count is reconciled against what we hold.
  let cancelled: number;
  let cancelledBounded = false;
  let open: number;

  if (data.cancelledDisjoint) {
    cancelled = Math.max(0, data.cancelledCount);
    // Completed/open come from the listing; cancelled live outside it.
    open = Math.max(0, orders.length - completed - cancelledInSet);
  } else {
    const openInSet = Math.max(0, orders.length - completed - cancelledInSet);
    cancelled = cancelledInSet;
    if (data.cancelledExact && data.cancelledCount > cancelledInSet) {
      if (data.cancelledCount - cancelledInSet <= openInSet) {
        cancelled = data.cancelledCount; // extra cancellations reconcile onto open rows
      } else {
        cancelledBounded = true;
      }
    }
    open = Math.max(0, orders.length - completed - cancelled);
  }

  // The window's true order count.
  const totalOrders = orders.length + (data.cancelledDisjoint ? cancelled : 0);
  const revenueMinor = sumMinor(completedOrders.map((o) => o.total));
  const avgTicketMinor = completed > 0 ? Math.round(revenueMinor / completed) : null;

  // "Unpaid" is the provider's order-level paid flag on completed work. Neither
  // API exposes invoices or AR, so this is collection risk, not receivables.
  let paidOrders = 0;
  let unpaidOrders = 0;
  let unpaidAmountMinor = 0;
  for (const o of completedOrders) {
    if (o.paid === true) paidOrders += 1;
    else if (o.paid === false) {
      unpaidOrders += 1;
      unpaidAmountMinor += o.total ?? 0;
    }
  }

  const overdueOpenOrders = orders.filter(
    (o) => !isCompleted(o) && !isCancelled(o) && isPast(o.scheduledAt, asOf),
  ).length;

  const dailySeries = buildDailySeries(orders, dayBuckets, timezone);

  const cancelRatePct =
    !cancelledBounded && totalOrders >= MIN_CANCEL_RATE_SAMPLE
      ? pct((cancelled / totalOrders) * 100)
      : null;

  return {
    orders: totalOrders,
    completed,
    cancelled,
    cancelledBounded,
    open,
    cancelRatePct,
    revenueMinor,
    avgTicketMinor,
    revenuePerDayMinor: Math.round(revenueMinor / Math.max(1, data.window.days)),
    paidOrders,
    unpaidOrders,
    unpaidAmountMinor,
    overdueOpenOrders,
    referralMix: topMix(completedOrders, (o) => o.referralSource, 'revenueMinor'),
    serviceMix: topMix(orders, (o) => o.serviceType, 'orders'),
    inspectors: data.peopleNamesUsable
      ? topInspectors(completedOrders)
      : [],
    /** Completed jobs with more than one inspector; makes inspector columns sum above the order count. */
    teamJobs: data.peopleNamesUsable ? countTeamJobs(completedOrders) : 0,
    dailySeries,
  };
}

function isPast(scheduledAt: string | undefined, asOf: Date): boolean {
  if (!scheduledAt) return false;
  const t = new Date(scheduledAt).getTime();
  if (Number.isNaN(t)) return false;
  return t < asOf.getTime();
}

function topMix(
  orders: OrderRecord[],
  label: (o: OrderRecord) => string | undefined,
  rankBy: 'orders' | 'revenueMinor',
): MixEntry[] {
  const map = new Map<string, { orders: number; revenueMinor: number }>();
  for (const o of orders) {
    const key = normLabel(label(o));
    if (!key || UUID_RE.test(key)) continue;
    const entry = map.get(key) ?? { orders: 0, revenueMinor: 0 };
    entry.orders += 1;
    entry.revenueMinor += o.total ?? 0;
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([labelText, v]) => ({ label: labelText, ...v }))
    .sort((a, b) => (rankBy === 'revenueMinor' ? b.revenueMinor - a.revenueMinor : b.orders - a.orders))
    .slice(0, TOP_MIX);
}

/**
 * Split a provider's people field into individual names.
 *
 * Spectora packs multiple inspectors into one string
 * (`"Alex Bruhl, Jim Reynolds"`) and marks provisional assignments with a
 * `(requested)` suffix. Grouping on the raw string therefore reported 6
 * "inspectors" for 3 people and split one person's workload across two rows.
 */
export function splitPeople(value: string | undefined): string[] {
  if (typeof value !== 'string') return [];
  const stripped = value.replace(/\(\s*requested\s*\)/gi, ' ');
  const parts = stripped
    .split(/[,;/&]| and /i)
    .map((p) => normLabel(p))
    .filter((p): p is string => !!p && !UUID_RE.test(p));
  // One person listed twice on the same job is still one person on that job.
  return [...new Set(parts)];
}

function topInspectors(orders: OrderRecord[]): InspectorLoad[] {
  const map = new Map<string, { orders: number; revenueMinor: number }>();
  for (const o of orders) {
    // Orders can have several inspectors (a team job). Each person is counted
    // for every job they worked, so this column sums to >= completed orders
    // whenever the month contained team jobs; callers disclose that.
    for (const name of splitPeople(o.inspectorName)) {
      const entry = map.get(name) ?? { orders: 0, revenueMinor: 0 };
      entry.orders += 1;
      entry.revenueMinor += o.total ?? 0;
      map.set(name, entry);
    }
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.orders - a.orders || b.revenueMinor - a.revenueMinor)
    .slice(0, TOP_INSPECTORS);
}

/** Orders in the window that list more than one inspector. */
function countTeamJobs(orders: OrderRecord[]): number {
  return orders.filter((o) => splitPeople(o.inspectorName).length > 1).length;
}

function buildDailySeries(
  orders: OrderRecord[],
  buckets: string[],
  timezone: string,
): DayPoint[] {
  const byDay = new Map<string, DayPoint>();
  for (const day of buckets) {
    byDay.set(day, { day, orders: 0, completed: 0, cancelled: 0, revenueMinor: 0 });
  }
  for (const o of orders) {
    const stamp = o.scheduledAt ?? o.createdAt;
    const key = bucketKeyFor(stamp, timezone);
    if (!key) continue;
    const point = byDay.get(key);
    if (!point) continue; // outside the window's buckets
    point.orders += 1;
    if (isCompleted(o)) {
      point.completed += 1;
      point.revenueMinor += o.total ?? 0;
    }
    if (isCancelled(o)) point.cancelled += 1;
  }
  return [...byDay.values()];
}

/** Current-vs-previous deltas. Null wherever the baseline cannot support one. */
export function computeDeltas(
  current: BriefingMetrics,
  previous: BriefingMetrics | null,
): Deltas {
  if (!previous) {
    return { ordersPct: null, revenuePct: null, avgTicketPct: null, cancelRatePoints: null };
  }
  return {
    ordersPct: pctChange(current.orders, previous.orders),
    revenuePct: pctChange(current.revenueMinor, previous.revenueMinor),
    avgTicketPct: pctChange(current.avgTicketMinor, previous.avgTicketMinor),
    cancelRatePoints:
      current.cancelRatePct !== null && previous.cancelRatePct !== null
        ? pct(current.cancelRatePct - previous.cancelRatePct)
        : null,
  };
}

/**
 * Assemble the trust layer. This is shown to owners and handed to the model so
 * it cannot present a bounded figure as a complete one.
 */
export function buildDataQuality(
  current: WindowData,
  previous: WindowData | null,
  currentMetrics: BriefingMetrics,
  peopleNamesUsable: boolean,
): DataQuality {
  const omissions: string[] = [];

  if (current.truncated) {
    const total = current.totalEstimate !== undefined ? ` of about ${current.totalEstimate}` : '';
    omissions.push(
      `Retrieval was capped at ${current.retrieved}${total} records, so these totals cover the retrieved subset only.`,
    );
  }
  if (!current.cancelledExact) {
    omissions.push('Cancellations were inferred from status values, not a provider cancel filter.');
  }
  if (currentMetrics.cancelledBounded) {
    omissions.push(
      'The provider reported more cancellations than were retrieved, so the cancel rate is a bounded estimate.',
    );
  }
  if (current.cancelledDisjoint && !current.truncated) {
    // Worth stating explicitly: the listing alone would understate the window.
    omissions.push(
      'Cancelled inspections are excluded from the provider default listing and counted from a separate filtered query, so the order total is the sum of both.',
    );
  }
  if (!peopleNamesUsable) {
    omissions.push(
      'Per-inspector metrics are unavailable: this provider returns agent identifiers rather than names.',
    );
  }
  if (currentMetrics.teamJobs > 0) {
    omissions.push(
      `${currentMetrics.teamJobs} completed job(s) list more than one inspector, so per-inspector job counts overlap.`,
    );
  }
  if (current.eventUnavailable) {
    omissions.push('Events could not be read from the provider for this window, so event counts are excluded.');
  }
  if (currentMetrics.avgTicketMinor === null) {
    omissions.push('No completed orders in this window, so average ticket is unavailable.');
  }
  const missingPaidFlag = currentMetrics.completed - currentMetrics.paidOrders - currentMetrics.unpaidOrders;
  if (missingPaidFlag > 0) {
    omissions.push(
      `${missingPaidFlag} completed order(s) carry no payment flag, so unpaid exposure may be understated.`,
    );
  }
  if (!previous) {
    omissions.push('No previous-period baseline was retrieved, so there are no trend comparisons.');
  }
  if (previous?.truncated) {
    omissions.push('The previous period was also capped, so trend percentages compare partial windows.');
  }

  return {
    truncated: current.truncated || (previous?.truncated ?? false),
    retrieved: current.retrieved,
    totalEstimate: current.totalEstimate,
    omissions,
    // Both windows usually report the same static provider limits; dedupe so the
    // email does not repeat the same line twice.
    providerLimits: [...new Set([...current.providerLimits, ...(previous?.providerLimits ?? [])])],
  };
}