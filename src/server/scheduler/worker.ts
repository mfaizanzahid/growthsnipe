import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { Env } from '../lib/env';
import { sidekickBriefingJobs } from '../db/schema';
import type { ProviderKey } from '../providers/types';
import { ProviderKeySchema } from '../providers/types';
import { collectBriefingFacts } from '../briefing/collect';
import { synthesizeBriefing } from '../sidekick/synthesis';
import { createDb } from '../repositories/db';
import { drizzleStore } from '../repositories/billing';
import { sendEmail } from '../lib/email';
import { portalInfo } from '../billing/mail';
import { briefingContent } from '../email/templates';

/** Human label for the schedule cadence, used in the email subject/title. */
export function periodLabel(type: string): string {
  if (type === 'weekly_review' || type === 'weekly') return 'Weekly review';
  if (type === 'monthly_review' || type === 'monthly') return 'Monthly review';
  return 'Morning briefing';
}

/**
 * Provider for a schedule. `ruleJson` is frequently `{}` (no provider pinned),
 * so the default must apply when the field is *missing*, not only when the whole
 * blob is absent — otherwise the adapter is queried with an undefined key.
 */
export function scheduleProvider(ruleJson: string | null | undefined): ProviderKey {
  let parsed: unknown = {};
  try {
    parsed = ruleJson ? JSON.parse(ruleJson) : {};
  } catch {
    parsed = {};
  }
  const candidate = (parsed as { provider?: unknown } | null)?.provider;
  return ProviderKeySchema.catch('spectora').parse(candidate);
}

/**
 * Collect verified facts → synthesize with AI → email the workspace admins.
 * Every stage records its status on the job row, so a failure is visible in the
 * dashboard instead of vanishing. Delivery targets active org admins (the same
 * audience as every other transactional email we send).
 *
 * The window and the analytical lens both come from the schedule, so a daily
 * briefing analyzes yesterday while a monthly review analyzes 30 days — the
 * cadence actually changes what is measured.
 */
export async function runBriefingJob(env: Env, jobId: string, schedule: any) {
  const db = drizzle(env.DB);
  const store = drizzleStore(createDb(env.DB));
  try {
    await db.update(sidekickBriefingJobs).set({ status: 'collecting' }).where(eq(sidekickBriefingJobs.id, jobId));
    const provider = scheduleProvider(schedule.ruleJson);
    const timezone = typeof schedule.timezone === 'string' && schedule.timezone ? schedule.timezone : 'UTC';
    const facts = await collectBriefingFacts(
      env,
      schedule.organizationId,
      provider,
      schedule.type,
      timezone,
      new Date(),
    );
    await db
      .update(sidekickBriefingJobs)
      .set({ status: 'synthesizing', payloadJson: JSON.stringify(facts) })
      .where(eq(sidekickBriefingJobs.id, jobId));
    const briefing = await synthesizeBriefing(env, facts);
    // Belt and braces: synthesis already rejects blank output, but an owner must
    // never receive an empty report marked "delivered".
    if (!briefing.trim()) {
      throw new Error('Briefing synthesis produced no content; refusing to deliver an empty report');
    }
    // Store the text before delivery so a mail outage never loses the briefing.
    await db
      .update(sidekickBriefingJobs)
      .set({ status: 'delivering', briefingText: briefing })
      .where(eq(sidekickBriefingJobs.id, jobId));

    const [org, info, recipients] = await Promise.all([
      store.getOrganization(schedule.organizationId),
      portalInfo(store),
      store.listOrgAdminEmails(schedule.organizationId),
    ]);
    const content = briefingContent({
      orgName: org?.name ?? 'your workspace',
      periodLabel: facts.cadenceLabel,
      briefingText: briefing,
      portalName: info.portalName,
      supportEmail: info.supportEmail,
      dashboardUrl: `${env.APP_BASE_URL ?? ''}/briefings-schedules`,
    });
    if (recipients.length === 0) {
      console.warn(`[sidekick] briefing ${jobId}: no active admin to deliver to`);
    }
    for (const to of recipients) {
      await sendEmail(
        env,
        { to, subject: content.subject, html: content.html },
        env.BRIEFING_FROM_EMAIL ?? env.RESEND_FROM_EMAIL,
      );
    }
    await db
      .update(sidekickBriefingJobs)
      .set({ status: 'delivered', completedAt: new Date() })
      .where(eq(sidekickBriefingJobs.id, jobId));
  } catch (e) {
    await db
      .update(sidekickBriefingJobs)
      .set({ status: 'failed', errorText: e instanceof Error ? e.message : String(e) })
      .where(eq(sidekickBriefingJobs.id, jobId));
    throw e;
  }
}