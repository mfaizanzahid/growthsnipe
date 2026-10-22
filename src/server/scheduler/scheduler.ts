import { and, eq, lte } from 'drizzle-orm';
import { createDb } from '../repositories/db';
import { drizzleStore } from '../repositories/billing';
import type { Env } from '../lib/env';
import { orgAccess } from '../billing/access';
import { sidekickBriefingJobs, sidekickSchedules } from '../db/schema';
import { runBriefingJob } from './worker';
import { nextRunFor, parseScheduleRule } from '../lib/local-time';

/** Dedupe key per schedule cadence: daily → day, weekly → ISO week, monthly → month. */
export function periodKeyFor(type: string, nowMs: number): string {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  if (type === 'monthly_review' || type === 'monthly') return `${y}-${m}`;
  if (type === 'weekly_review' || type === 'weekly') {
    // ISO week number (Monday-first).
    const jan4 = new Date(Date.UTC(y, 0, 4));
    const week = Math.ceil((((d.getTime() - jan4.getTime()) / 86400000) + jan4.getUTCDay() + 1) / 7);
    return `${y}-w${String(week).padStart(2, '0')}`;
  }
  return `${y}-${m}-${day}`;
}

/**
 * Next run for a schedule, honoring its own wall-clock time and zone. The Cron
 * is only an hourly heartbeat, so this decides the real fire time (and stays
 * correct across DST because it resolves the local wall clock, not a fixed
 * 24-hour offset).
 */
export function nextRunAtFor(
  schedule: { type: string; timezone: string; localTime: string; ruleJson?: string | null },
  fromMs: number,
): Date {
  return nextRunFor(
    schedule.type,
    schedule.timezone,
    schedule.localTime,
    new Date(fromMs),
    parseScheduleRule(schedule.ruleJson),
  );
}

export interface RunBriefingsOptions {
  /** Restrict to one workspace (support / verification). */
  orgId?: string;
  /** Run enabled schedules even when they are not due yet. */
  force?: boolean;
  /** Reset and re-run the period's job when one already exists. */
  rerun?: boolean;
  /** Who asked — recorded in the run summary for the audit trail. */
  actor?: string;
}

export interface RunBriefingsResult {
  actor: string;
  ran: number;
  failed: number;
  skippedGated: number;
  skippedNotEntitled: number;
  skippedDuplicate: number;
  jobs: Array<{ jobId: string; scheduleId: string; orgId: string; type: string; status: string; error?: string }>;
}

/**
 * One briefing pass. The Cron calls this with no options: only enabled schedules
 * that are actually due, one job per (schedule, period). Manual triggers can
 * narrow it to one workspace and/or force it ahead of schedule.
 */
export async function runDueSchedules(
  env: Env,
  nowMs: number,
  opts: RunBriefingsOptions = {},
): Promise<RunBriefingsResult> {
  return runBriefings(env, createDb(env.DB), nowMs, opts);
}

/** Same pass, but against a caller-supplied D1 handle (route requests, tests). */
export async function runBriefings(
  env: Env,
  db: ReturnType<typeof createDb>,
  nowMs: number,
  opts: RunBriefingsOptions = {},
): Promise<RunBriefingsResult> {
  const due = await db
    .select()
    .from(sidekickSchedules)
    .where(
      and(
        eq(sidekickSchedules.enabled, true),
        ...(opts.force ? [] : [lte(sidekickSchedules.nextRunAt, new Date(nowMs))]),
        ...(opts.orgId ? [eq(sidekickSchedules.organizationId, opts.orgId)] : []),
      ),
    )
    .limit(50);
  const result: RunBriefingsResult = {
    actor: opts.actor ?? 'cron',
    ran: 0,
    failed: 0,
    skippedGated: 0,
    skippedNotEntitled: 0,
    skippedDuplicate: 0,
    jobs: [],
  };

  for (const s of due) {
    // Gated workspaces (expired trial, suspended billing) get no briefings.
    const access = await orgAccess(drizzleStore(db), s.organizationId, Math.floor(nowMs / 1000));
    if (access.state !== 'trial' && access.state !== 'active') {
      result.skippedGated += 1;
      continue;
    }
    // Entitlement is re-checked at run time, not just when the schedule was
    // created: a downgrade (or a schedule left over from a paid period) must not
    // keep producing Pro-only briefings.
    if (!access.allowBriefings) {
      result.skippedNotEntitled += 1;
      continue;
    }
    const periodKey = periodKeyFor(s.type, nowMs);
    const id = crypto.randomUUID();
    try {
      await db.insert(sidekickBriefingJobs).values({ id, scheduleId: s.id, organizationId: s.organizationId, periodKey, status: 'scheduled', createdAt: new Date() });
    } catch {
      // The (schedule, period) dedupe index rejects a second job for the same
      // period. The Cron skips it; an explicit rerun resets that row instead.
      if (!opts.rerun) {
        result.skippedDuplicate += 1;
        continue;
      }
      const existing = await db
        .select()
        .from(sidekickBriefingJobs)
        .where(and(eq(sidekickBriefingJobs.scheduleId, s.id), eq(sidekickBriefingJobs.periodKey, periodKey)))
        .limit(1);
      const prior = existing[0];
      if (!prior) {
        result.skippedDuplicate += 1;
        continue;
      }
      await db
        .update(sidekickBriefingJobs)
        .set({
          status: 'scheduled',
          payloadJson: null,
          briefingText: null,
          errorText: null,
          completedAt: null,
        })
        .where(eq(sidekickBriefingJobs.id, prior.id));
      result.jobs.push({
        jobId: prior.id,
        scheduleId: s.id,
        orgId: s.organizationId,
        type: s.type,
        status: 'reset',
      });
      await runOne(env, db, s, prior.id, nowMs, result);
      continue;
    }
    await runOne(env, db, s, id, nowMs, result);
  }
  return result;
}

/** Run one job and advance the schedule, recording the outcome either way. */
async function runOne(
  env: Env,
  db: ReturnType<typeof createDb>,
  schedule: (typeof sidekickSchedules.$inferSelect),
  jobId: string,
  nowMs: number,
  result: RunBriefingsResult,
) {
  let status = 'delivered';
  let error: string | undefined;
  try {
    await runBriefingJob(env, jobId, schedule);
  } catch (err) {
    console.error(`[sidekick] briefing job ${jobId} failed`, err);
    status = 'failed';
    error = err instanceof Error ? err.message : String(err);
  } finally {
    // Advance even on failure: the failure is recorded on the job and the
    // next period gets a fresh attempt (no retry spam within the hour).
    await db.update(sidekickSchedules).set({ lastRunAt: new Date(nowMs), nextRunAt: nextRunAtFor(schedule, nowMs) }).where(eq(sidekickSchedules.id, schedule.id));
  }
  const entry = result.jobs.find((j) => j.jobId === jobId);
  if (entry) {
    entry.status = status;
    if (error) entry.error = error;
  } else {
    result.jobs.push({ jobId, scheduleId: schedule.id, orgId: schedule.organizationId, type: schedule.type, status });
  }
  if (status === 'failed') result.failed += 1;
  else result.ran += 1;
}