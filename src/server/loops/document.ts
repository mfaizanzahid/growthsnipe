import type { Env } from "../types";
import type { Db } from "../repositories/db";
import type { OneTimeOrderRow } from "../repositories/billing";
import { getSetting } from "../repositories";
import { updateOneTimeOrder } from "../repositories/billing";
import { upsertLoopLead, scheduleMarketingSends } from "../repositories/marketing";
import { WELCOME_SEQUENCE, WELCOME_SEQUENCE_KEY, stepsFor } from "../marketing/sequences";
import { sendEmail } from "../lib/email";
import { PORTAL_NAME } from "../lib/brand";
import { firstNameOf, layout, loopsDocumentContent } from "../email/templates";
import { signLoopsDocumentToken } from "./tokens";

/** The welcome sequence starts five hours after a Loops checkout. */
export const LOOPS_WELCOME_DELAY_MS = 5 * 60 * 60 * 1000;

function baseUrl(env: Pick<Env, "APP_BASE_URL">): string {
  return (env.APP_BASE_URL ?? "").replace(/\/+$/, "");
}

export async function loopsDocumentUrl(
  env: Pick<Env, "APP_BASE_URL" | "BETTER_AUTH_SECRET">,
  orderId: string,
  now = Date.now(),
): Promise<string> {
  const token = await signLoopsDocumentToken(env, { orderId, now });
  return `${baseUrl(env)}/api/one-time/loops/${encodeURIComponent(orderId)}/document?token=${encodeURIComponent(token)}`;
}

/**
 * Send the standard SNIPE Loops playbook with a signed on-demand PDF link.
 * The first send is automatic; superadmin resend passes `force`.
 */
export async function sendLoopsDocumentEmail(
  db: Db,
  env: Env,
  order: OneTimeOrderRow,
  force = false,
  now = Date.now(),
): Promise<void> {
  if (order.documentSentAt && !force) return;
  const documentUrl = await loopsDocumentUrl(env, order.id, now);
  const support = (await getSetting(db, "support_email").catch(() => null)) ?? "";
  const content = loopsDocumentContent({
    firstName: firstNameOf(order.name),
    documentUrl,
    diagnosticUrl: `${baseUrl(env)}/diagnostic`,
  });
  await sendEmail(
    env,
    {
      to: order.email,
      subject: `[${PORTAL_NAME}] ${content.subject}`,
      html: layout(
        PORTAL_NAME,
        support,
        documentUrl,
        content.subject,
        content.html,
        "Download your playbook",
      ),
    },
    env.RESEND_FROM_EMAIL,
  );
  await updateOneTimeOrder(db, order.id, { documentSentAt: now, updatedAt: now });
}

/**
 * Treat a paid Loops buyer as a new marketing lead. The welcome sequence is
 * scheduled at paidAt + 5 hours so the playbook email lands first. The
 * `welcome_scheduled_at` guard and the marketing send ledger keep this
 * idempotent, including for buyers who already have a lead record.
 */
export async function ensureLoopsWelcome(
  db: Db,
  order: OneTimeOrderRow,
  now = Date.now(),
): Promise<void> {
  if (order.welcomeScheduledAt) return;
  if (!order.email) return;
  const firstName = order.firstName?.trim() || firstNameOf(order.name);
  const lead = await upsertLoopLead(db, {
    email: order.email,
    firstName,
    lastName: order.lastName ?? null,
    businessName: order.businessName?.trim() ?? "",
    trade: order.trade?.trim() ?? "",
    now,
  });
  const anchor = now + LOOPS_WELCOME_DELAY_MS;
  await scheduleMarketingSends(db, {
    leadId: lead.id,
    email: order.email,
    sequence: WELCOME_SEQUENCE_KEY,
    steps: stepsFor(WELCOME_SEQUENCE, anchor),
    now,
  });
  await updateOneTimeOrder(db, order.id, { welcomeScheduledAt: now, updatedAt: now });
}
