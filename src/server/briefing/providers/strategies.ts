import type { BusinessProviderAdapter, OrderRecord } from '../../providers/types';
import { SPECTORA_PAGE_MAX } from '../../providers/spectora/params';
import { DEFAULT_BRIEFING_MAX_PAGES, DEFAULT_ISN_SAFETY_LIMIT } from '../../lib/retrieval-limits';
import type { WindowData } from '../types';
import type { AnalysisWindow } from '../windows';

/**
 * Provider-specific collection for briefings.
 *
 * Each strategy may only use endpoints, filters and fields its own contract
 * verifies — that constraint is the whole point of this abstraction. A metric
 * that a platform cannot support is omitted with a stated reason instead of
 * being approximated from a field that means something else.
 */
export interface BriefingStrategy {
  provider: string;
  /**
   * Whether this platform can afford a second (previous-period) pass. ISN is
   * single-window until its full-collection payloads are probed live.
   */
  supportsComparison: boolean;
  /** True when agent fields carry real names rather than identifiers. */
  peopleNamesUsable: boolean;
  /** Collect one window. Must never throw for a missing metric. */
  collect(adapter: BusinessProviderAdapter, window: AnalysisWindow): Promise<WindowData>;
}

/**
 * ISN list endpoints ignore `limit`: the adapter downloads the whole matching
 * collection and returns it, so `limit` reduces nothing at the provider and is
 * only the request's stated intent. We still pass the adapter's backstop so the
 * request and the retention bound are visibly the same number.
 */
const ISN_WHOLE_WINDOW = DEFAULT_ISN_SAFETY_LIMIT;

async function fetchOrdersPaged(
  adapter: BusinessProviderAdapter,
  from: string,
  to: string,
  pageSize: number,
  maxPages: number,
): Promise<{ items: OrderRecord[]; truncated: boolean; totalEstimate?: number }> {
  const items: OrderRecord[] = [];
  let cursor: string | undefined;
  let truncated = false;
  let totalEstimate: number | undefined;
  for (let page = 0; page < maxPages; page++) {
    const res: Awaited<ReturnType<BusinessProviderAdapter['searchOrders']>> = await adapter.searchOrders({
      limit: pageSize,
      from,
      to,
      cursor,
    });
    items.push(...res.items);
    if (typeof res.totalEstimate === 'number') totalEstimate = res.totalEstimate;
    if (!res.nextCursor) {
      truncated = totalEstimate !== undefined && totalEstimate > items.length;
      return { items, truncated, totalEstimate };
    }
    cursor = res.nextCursor;
  }
  return { items, truncated: true, totalEstimate };
}

/**
 * Spectora (`GET /v2/inspections`, `/v2/events`).
 *
 * Verified capabilities used here:
 *  - date windowing via `filter[datetime_greater_than]` / `[datetime_less_than]`
 *  - page-based pagination with `page[size]` up to 200
 *  - `filter[canceled]=true`, the only verified status filter, giving an exact
 *    cancellation count for the window
 *  - events via `filter[start_datetime_between]` (day precision only)
 *  - `inspector_name` / `referral_source` / `serviceNames` are real names
 *
 * Not used: `/v2/agent-stats` (documented but never live-probed) and any
 * `include`/`sort` passthrough (the client does not send them).
 */
export function spectoraStrategy(maxPages: number = DEFAULT_BRIEFING_MAX_PAGES): BriefingStrategy {
  return {
    provider: 'spectora',
    supportsComparison: true,
    peopleNamesUsable: true,
    async collect(adapter, window) {
      const [orders, cancelled, events] = await Promise.all([
        fetchOrdersPaged(adapter, window.from, window.to, SPECTORA_PAGE_MAX, maxPages),
        // Exact cancellation count from the provider's own cancel filter.
        adapter.searchOrders({
          limit: 1,
          from: window.from,
          to: window.to,
          status: 'cancelled',
        }),
        adapter.searchEvents({ limit: 100, from: window.from, to: window.to }).catch(() => null),
      ]);

      return {
        window,
        orders: orders.items,
        cancelledCount: cancelled.totalEstimate ?? 0,
        cancelledExact: cancelled.totalEstimate !== undefined,
        // Live-verified 2026-10-17: of 103 windowed records returned by
        // GET /v2/inspections, ZERO carried `canceled_at`, while the same
        // window with filter[canceled]=true returned 10 more. The default
        // listing excludes cancelled inspections, so they are counted separately
        // rather than reconciled against the fetched set.
        cancelledDisjoint: true,
        eventCount: events?.items.length ?? 0,
        eventUnavailable: events === null,
        retrieved: orders.items.length,
        totalEstimate: orders.totalEstimate,
        truncated: orders.truncated,
        peopleNamesUsable: true,
        providerLimits: [
          `Page size is the provider maximum (${SPECTORA_PAGE_MAX}); followed at most ${maxPages} pages per window.`,
        ],
      };
    },
  };
}

/**
 * ISN (`/json/orders` windowed read, `/calendarevents`).
 *
 * Verified constraints that shape this strategy (re-probed live 2026-10-18):
 *  - windowed order reads go through `{base}/json/orders`, which REQUIRES
 *    `start`/`end` ISO instants and returns a bare array of full-detail orders
 *    (money + `*_display` names). Every other param is ignored, so the adapter
 *    takes the whole window and slices client-side.
 *  - `show:"no"` rows are deleted and dropped by the mapper (57 of 502 in the
 *    sampled 30-day window), so the retained population is live work only.
 *  - there is no `completed` flag on windowed reads: a non-cancelled order
 *    scheduled in the past is reported completed (see mapper.ts). Cancellation
 *    IS an explicit per-row flag, so the cancel count is exact.
 *  - inspector names are real (`inspectorN_display`), so per-person metrics
 *    ARE reported for ISN from the 2026-10-18 probe onward.
 *
 * Comparison is enabled (owner decision, 2026-10-17): two windows means two
 * windowed reads, each of which returns its whole window in one call. There is
 * no per-window item cap any more — the adapter's memory backstop is the only
 * bound and it does not bind for real windows. Consecutive windows share a
 * boundary day because ISN filters are day-precision, which is disclosed below
 * so period-over-period deltas are read with that in mind.
 */
export function isnStrategy(_maxPages: number = DEFAULT_BRIEFING_MAX_PAGES): BriefingStrategy {
  return {
    provider: 'isn',
    supportsComparison: true,
    peopleNamesUsable: true,
    async collect(adapter, window) {
      const orders = await adapter.searchOrders({
        limit: ISN_WHOLE_WINDOW,
        from: window.from,
        to: window.to,
      });
      const events = await adapter.searchEvents({ limit: ISN_WHOLE_WINDOW, from: window.from, to: window.to }).catch(() => null);

      const items = orders.items;
      // Cancellations come from the vendor's own per-row `canceled` flag, so the
      // count is exact; `cancelledCount` stays 0 and analyze derives it from the
      // retained rows rather than reconciling a separate provider total.
      // `totalEstimate` is the pre-slice length, so this flags truncation only
      // when the adapter's memory backstop actually bit.
      const truncated = typeof orders.totalEstimate === 'number' && orders.totalEstimate > items.length;

      return {
        window,
        orders: items,
        cancelledCount: 0,
        cancelledExact: true,
        eventCount: events?.items.length ?? 0,
        eventUnavailable: events === null,
        retrieved: items.length,
        totalEstimate: orders.totalEstimate,
        truncated,
        peopleNamesUsable: true,
        providerLimits: [
          `ISN windowed reads return the whole window in one call; GrowthSnipe retains it with a ${DEFAULT_ISN_SAFETY_LIMIT}-item memory backstop that does not bind for real windows.`,
          'ISN date filters accept whole days only, so consecutive comparison windows share a boundary day and that day is counted in both.',
          'ISN exposes no completion flag on windowed reads: a non-cancelled order scheduled in the past is treated as completed, and deleted (hidden) orders are excluded.',
        ],
      };
    },
  };
}

const STRATEGIES: Record<string, (maxPages: number) => BriefingStrategy> = {
  spectora: spectoraStrategy,
  isn: (maxPages) => isnStrategy(maxPages),
};

/**
 * Strategy for a provider, or null when we have no verified collection plan.
 * `maxPages` is the per-window page budget (see lib/retrieval-limits.ts); it is
 * ignored by ISN, which returns each whole window in a single call.
 */
export function strategyFor(
  provider: string,
  maxPages: number = DEFAULT_BRIEFING_MAX_PAGES,
): BriefingStrategy | null {
  return STRATEGIES[provider]?.(maxPages) ?? null;
}