/**
 * Which Cron jobs a given invocation should run.
 *
 * The Worker has two triggers: a daily billing trigger ("0 3 * * *") and an
 * hourly Sidekick tick ("0 * * * *"). Cloudflare invokes the same
 * `scheduled()` handler for both, so the jobs have to be told apart by
 * `controller.cron` - otherwise billing runs 288 times a day.
 *
 * Billing work is day-granular (reminder offsets, dunning windows, 24h
 * auto-retry gaps), so it belongs on the daily trigger. The hourly tick exists
 * to advance briefings, which are themselves whole-hour schedules.
 */
export interface CronPlanInput {
  /** The exact cron expression that fired (`controller.cron`). */
  cron: string;
  /** The daily cron expression, as configured in wrangler.jsonc. */
  dailyCron: string;
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
    // The daily trigger skips briefings so a briefing is never scheduled
    // twice in the same minute (both triggers fire at 03:00).
    runBriefings: !isDaily,
    // Retention is a once-a-day sweep.
    runRetentionPurge: isDaily,
  };
}
