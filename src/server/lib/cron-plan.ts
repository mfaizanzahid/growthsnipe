/**
 * Which Cron jobs a given invocation should run.
 *
 * The Worker has three triggers: a daily billing trigger ("0 3 * * *"), an
 * hourly tick ("0 * * * *"), and a minutely analytics tick ("* * * * *").
 * Cloudflare invokes the same `scheduled()` handler for all three, so the
 * jobs have to be told apart by `controller.cron` - otherwise billing runs
 * 1,440 times a day.
 *
 * Billing work is day-granular (reminder offsets, dunning windows, 24h
 * auto-retry gaps), so it belongs on the daily trigger. The hourly tick exists
 * to advance briefings, which are themselves whole-hour schedules. Analytics
 * runs on every non-daily tick: backfills and enrichment progress every
 * minute, while live workspaces stay throttled to hourly incrementals
 * by their own last-synced check in the worker.
 */
export interface CronPlanInput {
  /** The exact cron expression that fired (`controller.cron`). */
  cron: string;
  /** The daily cron expression, as configured in wrangler.jsonc. */
  dailyCron: string;
  /** The hourly cron expression, as configured in wrangler.jsonc. */
  hourlyCron: string;
  /** UTC day (YYYY-MM-DD) the billing run last completed; "" when never. */
  lastBillingDay: string;
  /** UTC day (YYYY-MM-DD) of this invocation. */
  today: string;
}

export interface CronPlan {
  /** Renewals + trial ownership. */
  runBilling: boolean;
  /** Sidekick briefing tick. */
  runBriefings: boolean;
  /** Analytics warehouse sync (backfill + enrichment). */
  runAnalytics: boolean;
  /** Platform-log retention purge. */
  runRetentionPurge: boolean;
}

export function planCron(input: CronPlanInput): CronPlan {
  const isDaily = input.cron === input.dailyCron;
  return {
    // The daily trigger always runs billing. Any other trigger only runs it
    // as a catch-up when the day's run has not happened yet - that way a
    // missed 03:00 invocation (deploy at 03:00, outage) does not stall
    // billing for a whole day.
    runBilling: isDaily || input.lastBillingDay !== input.today,
    // Briefings run on the hourly tick only: they are whole-hour schedules
    // and due-gated internally, so the minutely tick would only repeat the
    // due-check (and its log row) 1,440 times a day. The daily trigger
    // skips them so a briefing is never scheduled twice in the same minute
    // (both triggers fire at 03:00).
    runBriefings: !isDaily && input.cron === input.hourlyCron,
    // Analytics rides every non-daily tick (hourly + minutely). The
    // worker throttles live workspaces to hourly incrementals itself, so the
    // extra ticks only accelerate backfills and enrichment.
    runAnalytics: !isDaily,
    // Retention is a once-a-day sweep.
    runRetentionPurge: isDaily,
  };
}
