import type { ProviderKey } from '../providers/types';
import type { AnalysisWindow } from './windows';

/**
 * What a briefing is built from. Every number here is computed deterministically
 * in `analyze.ts` — the language model only narrates them. That split is what
 * makes a briefing trustworthy: the model cannot invent a count, and anything we
 * could not compute is listed in `dataQuality.omissions` instead of silently
 * missing.
 *
 * All money is integer minor units (cents).
 */
export interface BriefingMetrics {
  /** All orders in the window, including any excluded from the default listing. */
  orders: number;
  completed: number;
  cancelled: number;
  /**
   * True when the provider's cancel count exceeded the orders we retrieved, so
   * the cancel rate is bounded rather than exact.
   */
  cancelledBounded: boolean;
  /** Neither completed nor cancelled. */
  open: number;
  /** 0-100, null when order count is too low to be meaningful. */
  cancelRatePct: number | null;
  /** Sum of completed order totals in the window. */
  revenueMinor: number;
  /** Mean completed order total; null when nothing completed. */
  avgTicketMinor: number | null;
  revenuePerDayMinor: number;
  paidOrders: number;
  unpaidOrders: number;
  /** Completed revenue not flagged paid — collection risk, not true AR. */
  unpaidAmountMinor: number;
  /** Open orders whose scheduled time has already passed. */
  overdueOpenOrders: number;
  /** Top referral sources by completed revenue. */
  referralMix: MixEntry[];
  /** Top service types by order count. */
  serviceMix: MixEntry[];
  /** Per-inspector workload. Empty when the provider returns IDs, not names. */
  inspectors: InspectorLoad[];
  /**
   * Completed jobs listing more than one inspector. Non-zero means the
   * inspector columns intentionally sum to more than the completed order count.
   */
  teamJobs: number;
  /** Completed-revenue and order count per local day, in window order. */
  dailySeries: DayPoint[];
}

export interface MixEntry {
  label: string;
  orders: number;
  revenueMinor: number;
}

export interface InspectorLoad {
  name: string;
  orders: number;
  revenueMinor: number;
}

export interface DayPoint {
  /** YYYY-MM-DD in the workspace timezone. */
  day: string;
  orders: number;
  completed: number;
  cancelled: number;
  revenueMinor: number;
}

/** Percentage change, or null when there is no usable baseline. */
export interface Deltas {
  ordersPct: number | null;
  revenuePct: number | null;
  avgTicketPct: number | null;
  cancelRatePoints: number | null;
}

/**
 * Everything a reader needs to know about how much to trust the numbers.
 * Rendered in the email and given to the model.
 */
export interface DataQuality {
  /** True when retrieval was capped before covering the window. */
  truncated: boolean;
  retrieved: number;
  /** Provider-reported total for the window, when it exposes one. */
  totalEstimate?: number;
  /** Metrics deliberately not computed, and why. */
  omissions: string[];
  /** Hard provider limits that shaped collection. */
  providerLimits: string[];
}

export interface BriefingFacts {
  cadence: string;
  cadenceLabel: string;
  provider: ProviderKey;
  currency: string;
  timezone: string;
  current: AnalysisWindow;
  previous: AnalysisWindow | null;
  metrics: BriefingMetrics;
  deltas: Deltas;
  dataQuality: DataQuality;
}

/** Raw per-window input to `analyze.ts`, before metrics exist. */
export interface WindowData {
  window: AnalysisWindow;
  orders: import('../providers/types').OrderRecord[];
  /** Cancelled orders counted from the provider's own cancel filter. */
  cancelledCount: number;
  /**
   * Whether cancelled orders came from a provider-side filter (exact) or were
   * inferred from status strings on the fetched set (approximate).
   */
  cancelledExact: boolean;
  /**
   * True when the provider's default listing EXCLUDES cancelled records, so
   * the cancel filter returns a *disjoint* population rather than a subset of
   * what we fetched (verified live on Spectora: 0 of 103 windowed records carry
   * `canceled_at`, while `filter[canceled]=true` returns 10 more).
   */
  cancelledDisjoint?: boolean;
  eventCount: number;
  /** True when the provider's event call failed rather than returning none. */
  eventUnavailable?: boolean;
  retrieved: number;
  totalEstimate?: number;
  truncated: boolean;
  /** True when the provider returns real names (not UUIDs) for agents. */
  peopleNamesUsable: boolean;
  providerLimits: string[];
}

export const MIN_CANCEL_RATE_SAMPLE = 5;