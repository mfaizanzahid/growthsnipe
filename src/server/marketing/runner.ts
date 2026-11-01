import { and, eq } from "drizzle-orm";
import type { Env } from "../types";
import type { Db } from "../repositories/db";
import { marketingSends } from "../../../db/schema";
import { sendEmail } from "../lib/email";
import { PORTAL_NAME } from "../lib/brand";
import { getSetting } from "../repositories";
import { layout } from "../email/templates";
import { buyerReminderContent, loopWelcomeDay0, loopWelcomeDay12, loopWelcomeDay2, loopWelcomeDay5, loopWelcomeDay8, type WelcomeEmailInput } from "../email/templates";
import {
  claimDueMarketingSends,
  claimFailedMarketingSends,
  findLoopLeadByEmail,
  getLoopLead,
  isSuppressed,
  markMarketingFailed,
  markMarketingSent,
  markMarketingSkipped,
  type MarketingSendRow,
} from "../repositories/marketing";
import { DIAG_CREDIT_SEQUENCE_KEY, MAX_SEND_ATTEMPTS, WELCOME_SEQUENCE_KEY } from "./sequences";
import { signLeadId } from "./tokens";

export interface MarketingRunSummary {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
}

function appUrl(env: Env): string {
  return (env.APP_BASE_URL ?? "https://growthsnipe.com").replace(/\/$/, "");
}

async function marketingContext(db: Db, env: Env) {
  const support = (await getSetting(db, "support_email").catch(() => null)) ?? "";
  return {
    from: env.RESEND_FROM_EMAIL,
    support,
    base: appUrl(env),
    secret: env.MARKETING_TOKEN_SECRET ?? env.BETTER_AUTH_SECRET ?? "",
  };
}

export function libraryLinkFor(base: string, token: string): string {
  return `${base}/loop-library/access?token=${encodeURIComponent(token)}`;
}

export function unsubscribeLinkFor(base: string, token: string): string {
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
}

async function welcomeInput(
  db: Db,
  send: MarketingSendRow,
  ctx: { base: string; secret: string },
): Promise<WelcomeEmailInput | null> {
  const lead = send.leadId ? await getLoopLead(db, send.leadId) : await findLoopLeadByEmail(db, send.email);
  if (!lead) return null;
  if (!ctx.secret) return null;
  const libToken = await signLeadId(ctx.secret, lead.id);
  const unsubToken = await signLeadId(ctx.secret, lead.id);
  const firstName = lead.firstName;
  return {
    firstName,
    libraryLink: libraryLinkFor(ctx.base, libToken),
    diagnosticLink: `${ctx.base}/diagnostic`,
    blueprintLink: `${ctx.base}/blueprint`,
    bookLink: `${ctx.base}/book`,
    unsubscribeUrl: unsubscribeLinkFor(ctx.base, unsubToken),
  };
}

function welcomeContent(step: string, input: WelcomeEmailInput): { subject: string; html: string } | null {
  switch (step) {
    case "day0":
      return loopWelcomeDay0(input);
    case "day2":
      return loopWelcomeDay2(input);
    case "day5":
      return loopWelcomeDay5(input);
    case "day8":
      return loopWelcomeDay8(input);
    case "day12":
      return loopWelcomeDay12(input);
    default:
      return null;
  }
}

async function buyerContent(
  db: Db,
  send: MarketingSendRow,
  ctx: { base: string; secret: string },
): Promise<{ subject: string; html: string } | null> {
  const lead = send.leadId ? await getLoopLead(db, send.leadId) : null;
  if (!ctx.secret) return null;
  const email = send.email;
  const name = lead?.firstName ?? "there";
  const unsubToken = lead ? await signLeadId(ctx.secret, lead.id) : await signLeadId(ctx.secret, `email:${email}`);
  const unsubscribeUrl = unsubscribeLinkFor(ctx.base, unsubToken);
  const kind = send.sequence === DIAG_CREDIT_SEQUENCE_KEY ? "diagnostic" : "blueprint";
  const deadline = new Date(send.dueAt).toISOString().slice(0, 10);
  const actionLink = kind === "diagnostic" ? `${ctx.base}/checkout/blueprint` : `${ctx.base}/engine`;
  return buyerReminderContent({ firstName: name, kind, step: send.stepKey, deadlineDate: deadline, actionLink, unsubscribeUrl });
}

async function deliverSend(db: Db, env: Env, send: MarketingSendRow, ctx: { base: string; secret: string; from: string | undefined; support: string }): Promise<"sent" | "skipped" | "failed"> {
  const lead = send.leadId ? await getLoopLead(db, send.leadId) : await findLoopLeadByEmail(db, send.email);
  if (lead?.unsubscribedAt || (await isSuppressed(db, send.email))) {
    await markMarketingSkipped(db, send.id);
    return "skipped";
  }
  let built: { subject: string; html: string } | null = null;
  if (send.sequence === WELCOME_SEQUENCE_KEY) {
    const input = await welcomeInput(db, send, ctx);
    if (!input) {
      await markMarketingFailed(db, send.id, "missing lead or token secret", send.attempts + 1);
      return "failed";
    }
    built = welcomeContent(send.stepKey, input);
  } else {
    built = await buyerContent(db, send, ctx);
  }
  if (!built) {
    await markMarketingFailed(db, send.id, `unknown step ${send.sequence}/${send.stepKey}`, send.attempts + 1);
    return "failed";
  }
  try {
    await sendEmail(
      env,
      {
        to: send.email,
        subject: `[${PORTAL_NAME}] ${built.subject}`,
        html: layout(PORTAL_NAME, ctx.support, ctx.base, built.subject, built.html),
      },
      ctx.from,
    );
  } catch (err) {
    await markMarketingFailed(db, send.id, err instanceof Error ? err.message : "send failed", send.attempts + 1);
    return "failed";
  }
  await markMarketingSent(db, send.id, Date.now());
  return "sent";
}

/**
 * Deliver one pending step immediately (Day-0 inline on capture, manual
 * resends). Returns false when there is nothing pending to send.
 */
export async function deliverPendingStep(
  db: Db,
  env: Env,
  email: string,
  sequence: string,
  step: string,
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(marketingSends)
    .where(
      and(
        eq(marketingSends.email, normalized),
        eq(marketingSends.sequence, sequence),
        eq(marketingSends.stepKey, step),
        eq(marketingSends.status, "pending"),
      ),
    )
    .limit(1);
  if (rows.length === 0) return false;
  const ctx = await marketingContext(db, env);
  return (await deliverSend(db, env, rows[0]!, ctx)) === "sent";
}

/**
 * Daily marketing tick: deliver due welcome + buyer-reminder steps exactly
 * once. Claim-then-send is not atomic, but the status flip to sent happens
 * only after a successful send, and a second tick that races the same row
 * re-sends only if the first has not marked it yet — the unique send ledger
 * plus per-step idempotency keeps duplicates to a lost race between two
 * daily ticks, which never overlap.
 */
export async function runDueMarketing(db: Db, env: Env, now = Date.now(), limit = 100): Promise<MarketingRunSummary> {
  const ctx = await marketingContext(db, env);
  const due = await claimDueMarketingSends(db, now, limit);
  const retries = await claimFailedMarketingSends(db, now, MAX_SEND_ATTEMPTS, limit);
  const summary: MarketingRunSummary = { checked: due.length + retries.length, sent: 0, skipped: 0, failed: 0 };
  for (const send of [...due, ...retries]) {
    const outcome = await deliverSend(db, env, send, ctx);
    summary[outcome === "sent" ? "sent" : outcome === "skipped" ? "skipped" : "failed"] += 1;
  }
  return summary;
}
