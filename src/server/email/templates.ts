/**
 * ALL email templates live here — auth + billing, in one place.
 *
 * Conventions:
 * - Builders are pure: input → { subject, html }. Sending stays in
 *   `lib/email.ts` (transport + outbox) and `billing/mail.ts` (branded
 *   senders with portal settings).
 * - Escape every user-controlled value with escapeHtml before interpolating.
 * - Inline styles only (email-client safe). Server-generated URLs/links are
 *   safe to interpolate raw.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  /** Blind-copied on delivery (superadmin audit copy). Preserved in test outbox. */
  bcc?: string[];
}

/** Escape user-controlled values interpolated into HTML emails. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function money(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}

/** First name for greeting personalization ("John Doe" → "John", fallback "there"). */
export function firstNameOf(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/).filter(Boolean)[0];
  return first ?? "there";
}

export function longDate(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/* Auth templates */

export function verificationContent(url: string): { subject: string; html: string } {
  return {
    subject: "Verify your email",
    html: `<p>Click the link below to verify your email address:</p><p><a href="${url}">Verify email</a></p>`,
  };
}

export function magicLinkContent(url: string): { subject: string; html: string } {
  return {
    subject: "Sign in to your account",
    html: `<p>Click the link below to sign in:</p><p><a href="${url}">Sign in</a></p>`,
  };
}

export function resetPasswordContent(url: string): { subject: string; html: string } {
  return {
    subject: "Reset your password",
    html: `<p>Click the link below to set a new password (valid for 1 hour):</p><p><a href="${url}">Reset password</a></p><p>If you did not request this, ignore this email.</p>`,
  };
}

export function invitationContent(
  orgName: string,
  inviteLink: string,
  supportEmail: string,
): { subject: string; html: string } {
  const safeOrg = escapeHtml(orgName);
  return {
    subject: `You're invited to join ${safeOrg}`,
    html: `<p>You've been invited to join <strong>${safeOrg}</strong>.</p><p><a href="${inviteLink}">Accept invitation</a></p><p>Need help? Contact ${escapeHtml(supportEmail)}.</p>`,
  };
}

/* Billing templates (branded layout pieces) */

export function layout(
  portalName: string,
  supportEmail: string,
  billingUrl: string,
  title: string,
  bodyHtml: string,
  actionLabel?: string,
): string {
  const action = actionLabel
    ? `<p style="margin-top:20px"><a href="${billingUrl}" style="display:inline-block;background-color:#111827;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px">${actionLabel}</a></p>`
    : "";
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111827;max-width:600px">` +
    `<p style="font-size:18px;font-weight:bold;margin:0 0 4px 0">${portalName}</p>` +
    `<p style="font-size:15px;font-weight:bold;margin:0 0 12px 0">${title}</p>` +
    bodyHtml +
    action +
    `<p style="font-size:12px;color:#666666;margin-top:24px">Need help? Contact ${supportEmail}.</p>` +
    `</div>`
  );
}

export function receiptContent(input: {
  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  planName: string;
  /** Set when the plan starts later (a trial converted to a prepaid plan). */
  planStartsAt?: number | null;
}): { subject: string; title: string; html: string } {
  const startsLine =
    input.planStartsAt != null
      ? `<p>Your ${escapeHtml(input.planName)} plan starts on ${new Date(input.planStartsAt * 1000)
          .toISOString()
          .slice(0, 10)} - your trial ends then, and the period you just paid for starts on that day.</p>`
      : "";
  return {
    subject: `Payment received - ${input.invoiceNumber}`,
    title: `Payment of ${money(input.amountMinor, input.currency)} received`,
    html: `<p>Your payment of ${money(input.amountMinor, input.currency)} for ${escapeHtml(input.planName)} succeeded.</p>${startsLine}<p>Invoice: ${input.invoiceNumber}</p>`,
  };
}

export function paymentFailedContent(input: {
  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  attempt: string;
}): { subject: string; title: string; html: string } {
  return {
    subject: `Payment failed — ${input.invoiceNumber}`,
    title: `Payment of ${money(input.amountMinor, input.currency)} failed`,
    html: `<p>We could not collect ${money(input.amountMinor, input.currency)} (${input.attempt}). Please update your payment method or retry from your billing portal.</p><p>Invoice: ${input.invoiceNumber}</p>`,
  };
}

export function trialReminderContent(input: {
  /** Days relative to trial end: -5/-3/0 before (or at) the end, 3/5 after. */
  offsetDays: -5 | -3 | 0 | 3 | 5;
  ended: boolean;
}): { subject: string; title: string; html: string } {
  const o = input.offsetDays;
  const when = input.ended
    ? o === 0
      ? "has ended"
      : `ended ${o} days ago`
    : o === 0
      ? "ends today"
      : `ends in ${-o} days`;
  const headline = input.ended ? "Trial ended" : `Trial ${when}`;
  return {
    subject: input.ended
      ? "Your trial has ended — subscribe to restore access"
      : `Your trial ${when} — subscribe to keep access`,
    title: headline,
    html: input.ended
      ? `<p>Your Pro trial ${when}. Dashboard, AI access, and briefings are paused until you subscribe to a paid plan. Your data is retained.</p>`
      : `<p>Your Pro trial ${when}. Subscribe now to keep uninterrupted access to your dashboard, AI access, and briefings.</p>`,
  };
}

export function dunningContent(input: {  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  final: boolean;
}): { subject: string; title: string; html: string } {
  return {
    subject: input.final
      ? `Final reminder — ${input.invoiceNumber} past due`
      : `Reminder — ${input.invoiceNumber} past due`,
    title: input.final ? "Final reminder: invoice past due" : "Reminder: invoice past due",
    html: input.final
      ? `<p>This is the final reminder: invoice ${input.invoiceNumber} for ${money(input.amountMinor, input.currency)} is still unpaid and your service is suspended. Pay now to restore access.</p>`
      : `<p>Invoice ${input.invoiceNumber} for ${money(input.amountMinor, input.currency)} is still unpaid. Please pay at your earliest convenience to avoid suspension.</p>`,
  };
}

export function cancelWarningContent(input: {
  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  cancelDateSec: number;
}): { subject: string; title: string; html: string } {
  return {
    subject: `Action required — ${input.invoiceNumber} unpaid, account closes ${longDate(input.cancelDateSec)}`,
    title: "Your account will be canceled in 5 days",
    html:
      `<p>Invoice ${input.invoiceNumber} for ${money(input.amountMinor, input.currency)} has been unpaid for 20 days.</p>` +
      `<p>If it is still unpaid on ${longDate(input.cancelDateSec)}, your subscription will be canceled and access suspended. ` +
      `Pay now or update your card to keep your service.</p>`,
  };
}

export function accountCancelledContent(planName: string): { subject: string; title: string; html: string } {
  const plan = escapeHtml(planName);
  return {
    subject: `Account canceled — ${plan} subscription ended for non-payment`,
    title: "Your account has been canceled",
    html:
      `<p>Your ${plan} subscription was canceled after 25 days without payment and access is now suspended. ` +
      `Your data is retained for now. Reply to this email or contact support to reactivate.</p>`,
  };
}

export function subscriptionNoticeContent(
  kind: "past_due" | "canceled" | "active",
  planName: string,
): { subject: string; title: string; html: string } {
  const plan = escapeHtml(planName);
  const titles = {
    past_due: "Subscription suspended",
    canceled: "Subscription canceled",
    active: "Subscription active",
  } as const;
  const subjects = {
    past_due: `Subscription suspended — ${plan}`,
    canceled: `Subscription canceled — ${plan}`,
    active: `Subscription active — ${plan}`,
  } as const;
  const bodies = {
    past_due: `<p>Your ${plan} subscription is past due and suspended. Pay your outstanding invoice to restore service. Your data is retained.</p>`,
    canceled: `<p>Your ${plan} subscription is canceled. You keep access until the end of the current billing period.</p>`,
    active: `<p>Your ${plan} subscription is active. Thank you.</p>`,
  } as const;
  return { subject: subjects[kind], title: titles[kind], html: bodies[kind] };
}

export function refundContent(input: {
  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  full: boolean;
}): { subject: string; title: string; html: string } {
  return {
    subject: `Refund issued — ${input.invoiceNumber}`,
    title: `Refund of ${money(input.amountMinor, input.currency)} issued`,
    html: input.full
      ? `<p>A full refund of ${money(input.amountMinor, input.currency)} was issued for invoice ${input.invoiceNumber}.</p>`
      : `<p>A partial refund of ${money(input.amountMinor, input.currency)} was issued for invoice ${input.invoiceNumber}.</p>`,
  };
}

export interface RenewalReminderRecipient {
  email: string;
  name: string | null;
}

/** Pre-renewal reminder (owner-supplied copy, product-branded). */
/**
 * Owner briefing delivery. The briefing text is AI-written markdown-ish prose,
 * so it is escaped and turned into paragraphs — never injected as HTML.
 */
export function briefingContent(input: {
  orgName: string;
  periodLabel: string;
  briefingText: string;
  portalName: string;
  supportEmail: string;
  dashboardUrl: string;
}): { subject: string; title: string; html: string } {
  const org = escapeHtml(input.orgName || "your workspace");
  const brand = escapeHtml(input.portalName || "Tradesmatic");
  const support = escapeHtml(input.supportEmail || "");
  const paragraphs = input.briefingText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px 0">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return {
    subject: `${input.portalName || "Tradesmatic"} ${escapeHtml(input.periodLabel)} briefing for ${org}`,
    title: `${escapeHtml(input.periodLabel)} briefing`,
    html:
      `<p style="margin:0 0 12px 0">Here is your ${escapeHtml(input.periodLabel)} briefing for ${org}.</p>` +
      (paragraphs || `<p style="margin:0 0 12px 0">No new activity to report this period.</p>`) +
      (support ? `<p style="margin:0 0 12px 0;font-size:12px;color:#666666">Questions? Reply to this email or contact ${support}.</p>` : ``) +
      `<p style="margin:0 0 12px 0;font-size:12px;color:#666666">Sent by ${brand}.</p>`,
  };
}

export function renewalReminderContent(
  recipient: RenewalReminderRecipient,
  input: {
    nextChargeSec: number;
    amountMinor: number;
    currency: string;
    interval: string;
    billingUrl: string;
    portalName: string;
    supportEmail: string;
  },
): { subject: string; html: string } {
  const period = input.interval === "year" ? "yearly" : "monthly";
  const date = longDate(input.nextChargeSec);
  const amount = money(input.amountMinor, input.currency);
  const greeting = escapeHtml(firstNameOf(recipient.name));
  const brand = escapeHtml(input.portalName || "Tradesmatic");
  const support = escapeHtml(input.supportEmail || "");
  return {
    subject: `${input.portalName || "Tradesmatic"} Subscription - Payment Renewal Ahead!`,
    html:
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111827;max-width:600px">` +
      `<p>Hi ${greeting},</p>` +
      `<p>Thank you for your continued trust in ${brand}.</p>` +
      `<p>We would like to inform you that your ${period} subscription of ${brand} will be renewed on ${date}. ` +
      `On this date, your credit card will be automatically charged ${amount} to ensure uninterrupted access to the service. ` +
      `No further action is required from your side.</p>` +
      (support ? `<p>If you have any questions or need assistance, please email us at ${support}.</p>` : ``) +
      `<p>If you wish to update your credit card details, <a href="${input.billingUrl}">click here</a>.</p>` +
      `<p>We look forward to a long term and mutually beneficial relationship.</p>` +
      `<p>Regards,<br/>Team ${brand}</p>` +
      `</div>`,
  };
}
