import type { Env } from "../types";
import type { BillingStore } from "../repositories/billing";
import { PORTAL_NAME } from "../lib/brand";
import { sendEmail /*, superadminBcc */ } from "../lib/email";
import {
  accountCancelledContent,
  cancelWarningContent,
  dunningContent,
  layout,
  paymentFailedContent,
  receiptContent,
  refundContent,
  renewalReminderContent,
  subscriptionNoticeContent,
  trialReminderContent,
  type RenewalReminderRecipient,
} from "../email/templates";

export type { RenewalReminderRecipient };

interface PortalInfo {
  portalName: string;
  supportEmail: string;
}

export async function portalInfo(store: BillingStore): Promise<PortalInfo> {
  const all = await store.getAllSettings();
  return {
    portalName: PORTAL_NAME,
    supportEmail: all.support_email ?? "",
  };
}

async function send(
  env: Env,
  store: BillingStore,
  to: string[],
  subject: string,
  title: string,
  bodyHtml: string,
  actionLabel?: string,
): Promise<void> {
  const info = await portalInfo(store);
  const fullSubject = `[${info.portalName}] ${subject}`;
  const billingUrl = `${env.APP_BASE_URL ?? ""}/billing`;
  const html = layout(info.portalName, info.supportEmail, billingUrl, title, bodyHtml, actionLabel);
  for (const recipient of to) {
    if (!recipient) continue;
    await sendEmail(
      env,
      { to: recipient, subject: fullSubject, html /*, bcc: superadminBcc(env, recipient) */ },
      env.RESEND_FROM_EMAIL,
    );
  }
}

export async function sendChargeReceipt(
  env: Env,
  store: BillingStore,
  to: string[],
  input: {
    invoiceNumber: string;
    amountMinor: number;
    currency: string;
    planName: string;
    /** Set when the plan starts later (a trial converted to a prepaid plan). */
    planStartsAt?: number | null;
  },
): Promise<void> {
  const c = receiptContent(input);
  await send(env, store, to, c.subject, c.title, c.html, "View billing");
}

export async function sendPaymentFailed(
  env: Env,
  store: BillingStore,
  to: string[],
  input: { invoiceNumber: string; amountMinor: number; currency: string; attempt: string },
): Promise<void> {
  const c = paymentFailedContent(input);
  await send(env, store, to, c.subject, c.title, c.html, "Update payment method");
}

export async function sendDunningReminder(  env: Env,
  store: BillingStore,
  to: string[],
  input: { invoiceNumber: string; amountMinor: number; currency: string; final: boolean },
): Promise<void> {
  const c = dunningContent(input);
  await send(env, store, to, c.subject, c.title, c.html, "Pay now");
}

/** 20-day overdue warning: account closes in 5 days unless paid. */
export async function sendCancelWarning(
  env: Env,
  store: BillingStore,
  to: string[],
  input: { invoiceNumber: string; amountMinor: number; currency: string; cancelDateSec: number },
): Promise<void> {
  const c = cancelWarningContent(input);
  await send(env, store, to, c.subject, c.title, c.html, "Pay now");
}

/** 25-day terminal notice: subscription canceled for non-payment. */
export async function sendAccountCancelled(
  env: Env,
  store: BillingStore,
  to: string[],
  planName: string,
): Promise<void> {
  const c = accountCancelledContent(planName);
  await send(env, store, to, c.subject, c.title, c.html, undefined);
}

export async function sendSubscriptionNotice(
  env: Env,
  store: BillingStore,
  to: string[],
  kind: "past_due" | "canceled" | "active",
  planName: string,
): Promise<void> {
  const c = subscriptionNoticeContent(kind, planName);
  await send(env, store, to, c.subject, c.title, c.html, kind === "past_due" ? "Pay now" : undefined);
}

export async function sendRefundNotice(
  env: Env,
  store: BillingStore,
  to: string[],
  input: { invoiceNumber: string; amountMinor: number; currency: string; full: boolean },
): Promise<void> {
  const c = refundContent(input);
  await send(env, store, to, c.subject, c.title, c.html, "View billing");
}

/** Trial upgrade reminders (offsets -5/-3/0 pre-expiry, 0/3/5 post-expiry). */
export async function sendTrialReminder(
  env: Env,
  store: BillingStore,
  to: string[],
  offsetDays: -5 | -3 | 0 | 3 | 5,
  ended: boolean,
): Promise<void> {
  const c = trialReminderContent({ offsetDays, ended });
  await send(env, store, to, c.subject, c.title, c.html, "Subscribe now");
}

/**
 * Pre-renewal reminder (owner-supplied copy, product-branded).
 * Sent per-recipient so the greeting is personalized.
 */
export async function sendRenewalReminder(
  env: Env,
  to: RenewalReminderRecipient[],
  input: {
    nextChargeSec: number;
    amountMinor: number;
    currency: string;
    interval: string;
    billingUrl: string;
    portalName: string;
    supportEmail: string;
  },
): Promise<void> {
  for (const recipient of to) {
    if (!recipient.email) continue;
    const c = renewalReminderContent(recipient, input);
    await sendEmail(
      env,
      { to: recipient.email, subject: c.subject, html: c.html /*, bcc: superadminBcc(env, recipient.email) */ },
      env.RESEND_FROM_EMAIL,
    );
  }
}
