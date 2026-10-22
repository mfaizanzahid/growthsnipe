import type { Env } from './env';

/**
 * Retrieval bounds for server-driven data collection (briefings + the dashboard
 * snapshot).
 *
 * These are NOT the MCP tool limits. MCP has no page cap because the *client*
 * loops: each `search_orders` call is a separate HTTP request with its own
 * budget, and `paginatedResult` tells the model to keep going. Nothing in a
 * single invocation can run away.
 *
 * A briefing has no client. `runBriefingJob` must collect both analysis windows,
 * synthesize, and send mail inside ONE Worker invocation, so its loop has to
 * terminate on its own. These constants are that termination rule, and they are
 * sized from the platform's real limits rather than picked by feel:
 *
 * - Workers allow 50 (Free) / 10,000 (Paid) subrequests per invocation, and D1
 *   queries count as subrequests alongside `fetch()` calls.
 * - CPU time is 30s per Cron Trigger when the trigger interval is under an hour.
 *   The Sidekick tick runs every five minutes, so every workspace's briefing due
 *   in a given tick shares that one 30s budget. Network waits do not count as CPU,
 *   but sequential page fetches do consume wall-clock inside the invocation.
 * - Spectora's own ceiling is `page[size] <= 200` (`SPECTORA_PAGE_MAX`).
 *
 * At 200 per page, the default budget below reads up to 10,000 orders per window:
 * roughly 90x the largest window observed in production (113 orders / 30 days)
 * and ~2% of the Paid subrequest allowance. Hitting it is therefore a genuine
 * platform-bound event to be disclosed, not routine truncation.
 *
 * ISN takes no page params at all: one read downloads the entire matching
 * collection, so the only real bound is memory. `DEFAULT_ISN_SAFETY_LIMIT` is
 * that backstop — far above any real workspace window (unfiltered ISN
 * collections observed at ~45k orders / ~42k agents), so it never binds in
 * practice and is never routine truncation; it only stops a runaway payload
 * from exhausting the isolate. Override per deployment with `ISN_SAFETY_LIMIT`.
 *
 * IMPORTANT: these differ by *purpose*, not by accident — do not unify the two
 * numbers blindly. Briefings are unattended and may request two windows (two
 * budgets); the dashboard snapshot is a single on-demand click with a fixed
 * 30-day window, and it is intentionally the more conservative of the two.
 */

/** Pages the dashboard's live snapshot may follow for one window. */
export const SNAPSHOT_MAX_PAGES = 5;

/** Per-page size for the dashboard snapshot (kept smaller: one window, on demand). */
export const SNAPSHOT_PAGE_LIMIT = 100;

/**
 * Backstop slice for ISN reads. ISN list endpoints take no limit/page/size
 * params, so one read downloads the whole matching collection and the adapter
 * only slices client-side — without a bound, a runaway payload could exhaust
 * the isolate's memory. Sized far above any observed workspace window
 * (unfiltered collections run ~45k orders / ~42k agents) so it does NOT bind in
 * practice; when it does bind, the shortfall is disclosed as a truncation
 * rather than silently dropped. Override with the `ISN_SAFETY_LIMIT` env var.
 */
export const DEFAULT_ISN_SAFETY_LIMIT = 50_000;

/** Hard floor so a bad env var cannot disable the backstop entirely. */
export const MIN_ISN_SAFETY_LIMIT = 1;

/** Default page budget for ONE briefing analysis window. */
export const DEFAULT_BRIEFING_MAX_PAGES = 50;

/** Hard floor so a bad env var cannot disable truncation disclosure entirely. */
export const MIN_BRIEFING_MAX_PAGES = 1;

/**
 * Resolve the briefing page budget for a request. Env override is for
 * deployments that genuinely hit a platform limit; anything unparseable or
 * nonsensical falls back to the documented default rather than throwing inside
 * a cron run.
 */
export function briefingMaxPages(env: Pick<Env, 'BRIEFING_MAX_PAGES'> | undefined): number {
  const raw = env?.BRIEFING_MAX_PAGES?.trim();
  if (!raw) return DEFAULT_BRIEFING_MAX_PAGES;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < MIN_BRIEFING_MAX_PAGES) return DEFAULT_BRIEFING_MAX_PAGES;
  return n;
}

/**
 * Resolve the ISN safety slice for a request. Env override is for deployments
 * that genuinely need a different backstop; anything unparseable or nonsensical
 * falls back to the documented default rather than throwing inside a read.
 */
export function isnSafetyLimit(env: Pick<Env, 'ISN_SAFETY_LIMIT'> | undefined): number {
  const raw = env?.ISN_SAFETY_LIMIT?.trim();
  if (!raw) return DEFAULT_ISN_SAFETY_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < MIN_ISN_SAFETY_LIMIT) return DEFAULT_ISN_SAFETY_LIMIT;
  return n;
}