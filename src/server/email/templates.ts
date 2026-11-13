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

import { formatCreditExpiry } from "../../lib/credit-coupon";

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

/** Add the ™ to the two one-time product names wherever they come from data. */
function brandProductName(value: string): string {
  return value
    .replace(/SNIPE Diagnostic(?!™)/g, "SNIPE Diagnostic™")
    .replace(/SNIPE Blueprint(?!™)/g, "SNIPE Blueprint™");
}

export interface EmailCreditCoupon {
  code: string;
  amountLabel: string;
  expiresAt: number | null;
  targetName: string;
  instructions: string;
}

function creditBlock(credit: EmailCreditCoupon | null | undefined): string {
  if (!credit) return "";
  const expires = formatCreditExpiry(credit.expiresAt);
  return (
    `<div style="margin-top:16px;padding:12px 14px;border:1px solid #d1d5db;border-radius:8px;background-color:#f9fafb">` +
    `<p style="margin:0 0 4px 0;font-size:15px;font-weight:bold">Your ${escapeHtml(credit.amountLabel)} ${escapeHtml(credit.targetName)} credit is ready.</p>` +
    `<p style="margin:0 0 4px 0">Use code <strong style="font-size:16px;letter-spacing:0.5px">${escapeHtml(credit.code)}</strong>${expires ? ` by <strong>${escapeHtml(expires)}</strong>` : ""}.</p>` +
    `<p style="margin:0;font-size:13px;color:#4b5563">${escapeHtml(credit.instructions)}</p>` +
    `</div>`
  );
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

/**
 * One-time purchase receipt (Diagnostic / Blueprint). The order reference is
 * an opaque id, not a guessable sequence.
 */
export function oneTimeReceiptContent(input: {
  productName: string;
  amountMinor: number;
  currency: string;
  orderRef: string;
  discountMinor?: number;
  couponCode?: string | null;
  credit?: EmailCreditCoupon | null;
}): { subject: string; html: string } {
  const branded = brandProductName(input.productName);
  const paymentLine =
    input.amountMinor === 0
      ? `<p>Your ${escapeHtml(branded)} order is complete. No payment was due.</p>`
      : `<p>Your payment of ${money(input.amountMinor, input.currency)} for ${escapeHtml(branded)} succeeded.</p>`;
  const discountLine =
    input.discountMinor && input.discountMinor > 0
      ? `<p>Credit applied: ${money(input.discountMinor, input.currency)}${input.couponCode ? ` (code ${escapeHtml(input.couponCode)})` : ""}.</p>`
      : "";
  return {
    subject:
      input.amountMinor === 0
        ? `Order complete - ${branded}`
        : `Payment received - ${branded}`,
    html:
      paymentLine +
      discountLine +
      `<p>Order reference: ${escapeHtml(input.orderRef)}</p>` +
      creditBlock(input.credit) +
      `<p>Your next email has the next steps.</p>`,
  };
}

/** Intake + next-steps email for one-time purchases (copy per §18 of the website strategy). */
export function oneTimeIntakeContent(input: {
  productSlug: "diagnostic" | "blueprint";
  firstName: string;
  credit?: EmailCreditCoupon | null;
  blueprintUrl?: string;
  bookUrl?: string;
}): { subject: string; html: string } {
  const name = escapeHtml(input.firstName);
  const credit = creditBlock(input.credit);
  if (input.productSlug === "blueprint") {
    const cta = input.bookUrl
      ? `<p><a href="${input.bookUrl}">Book your Engine fit call</a></p>`
      : "";
    return {
      subject: "Let's build your growth plan: intake inside",
      html:
        `<p>Hi ${name},</p>` +
        `<p>Thank you for purchasing the SNIPE Blueprint™. Complete the intake and provide the requested business information. The 10-business-day delivery window begins once the required information is complete.</p>` +
        `<p>You will receive:</p><ul><li>Your intake checklist.</li><li>Secure data-submission instructions.</li><li>A confirmation when the information is complete.</li><li>A scheduling link for your 90-minute Blueprint presentation.</li></ul>` +
        credit +
        cta,
    };
  }
  const cta = input.blueprintUrl
    ? `<p><a href="${input.blueprintUrl}">Get My SNIPE Blueprint™</a></p>`
    : "";
  return {
    subject: "Your SNIPE Diagnostic™ is underway",
    html:
      `<p>Hi ${name},</p>` +
      `<p>Thank you for purchasing the SNIPE Diagnostic™. The next step is to connect your booking software so we can review your last 12 months of jobs, revenue, referrals, and service mix.</p>` +
      `<p>Watch for a separate email with your secure connect link. The connection is encrypted, used only for this review, and removed once your report is ready.</p>` +
      `<p>Once connected, we will email your report and coordinate your 60-minute readout.</p>` +
      credit +
      cta,
  };
}

/** Diagnostic: secure connect link (sent after purchase). */
export function diagnosticConnectContent(input: {
  firstName: string;
  connectUrl: string;
}): { subject: string; html: string } {
  const name = escapeHtml(input.firstName);
  return {
    subject: "Connect your software to start your SNIPE Diagnostic™",
    html:
      `<p>Hi ${name},</p>` +
      `<p>Connect Spectora or ISN to start your 12-month review. The credentials are encrypted and used only for this Diagnostic. They are removed when your report is ready.</p>` +
      `<p><a href="${input.connectUrl}">Connect your booking software</a></p>` +
      `<p>If the button does not work, copy this link into your browser: ${input.connectUrl}</p>`,
  };
}

/** Diagnostic: report ready with the signed download link. */
export function diagnosticReadyContent(input: {
  firstName: string;
  reportUrl: string;
  bookUrl: string;
  blueprintUrl?: string;
  credit?: EmailCreditCoupon | null;
}): { subject: string; html: string } {
  const name = escapeHtml(input.firstName);
  const blueprintCta = input.blueprintUrl
    ? `<p><a href="${input.blueprintUrl}">Get My SNIPE Blueprint™</a></p>`
    : "";
  return {
    subject: "Your SNIPE Diagnostic™ is ready",
    html:
      `<p>Hi ${name},</p>` +
      `<p>Your 12-month review is ready. It includes your baseline, SNIPE Framework scores, referral performance, leak map, priority findings, and a 30-day plan.</p>` +
      `<p><a href="${input.reportUrl}">Download your Diagnostic report</a></p>` +
      creditBlock(input.credit) +
      `<p>Want to walk through it together? <a href="${input.bookUrl}">Book your 60-minute readout</a>.</p>` +
      blueprintCta,
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
      ? "Your trial has ended. Subscribe to restore access"
      : `Your trial ${when}. Subscribe to keep access`,
    title: headline,
    html: input.ended
      ? `<p>Your SNIPE Intelligence™ trial ${when}. Dashboard access is paused until you subscribe to a paid plan. Your data is retained.</p>`
      : `<p>Your SNIPE Intelligence™ trial ${when}. Subscribe now to keep uninterrupted access to your dashboard.</p>`,
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

/* Marketing templates (Loop Library + buyer follow-ups). Copy per the website strategy. */

export function marketingFooter(unsubscribeUrl: string): string {
  return (
    `<p style="font-size:12px;color:#666;margin-top:24px">You are receiving this because you asked for SNIPE Loops™ or purchased a GrowthSnipe offer. <a href="${unsubscribeUrl}">Unsubscribe</a> at any time.</p>`
  );
}

export interface WelcomeEmailInput {
  firstName: string;
  libraryLink: string;
  diagnosticLink: string;
  blueprintLink: string;
  bookLink: string;
  unsubscribeUrl: string;
}

export function loopWelcomeDay0(input: WelcomeEmailInput): { subject: string; html: string } {
  const name = escapeHtml(firstNameOf(input.firstName));
  return {
    subject: "Your SNIPE Loops™ are ready",
    html:
      `<p>Hi ${name},</p>` +
      `<p>Here is your access to SNIPE Loops™.</p>` +
      `<p><a href="${input.libraryLink}">Access SNIPE Loops™</a></p>` +
      `<p>Start with the workflow that fixes the most obvious gap in your business. For many operators, that is missed-call follow-up, unbooked enquiries or quote follow-up.</p>` +
      `<p>Do not install everything at once. Pick one loop, adapt it to the way your team works, test it and measure what changes.</p>` +
      `<p>GrowthSnipe</p>` +
      marketingFooter(input.unsubscribeUrl),
  };
}

export function loopWelcomeDay2(input: WelcomeEmailInput): { subject: string; html: string } {
  const name = escapeHtml(firstNameOf(input.firstName));
  return {
    subject: "A lead is not a booked job",
    html:
      `<p>Hi ${name},</p>` +
      `<p>A new enquiry is only the beginning. Someone still has to respond, understand what the customer needs, make the next step clear and follow up if the customer does not book immediately.</p>` +
      `<p>Take one recent lead and trace what happened from the first contact to the final outcome. Where did it slow down? Was there a clear next action? Could another team member see the history?</p>` +
      `<p>That is the kind of leak the SNIPE System is built to uncover.</p>` +
      `<p><a href="${input.libraryLink}">Explore SNIPE Loops™</a></p>` +
      `<p>GrowthSnipe</p>` +
      marketingFooter(input.unsubscribeUrl),
  };
}

export function loopWelcomeDay5(input: WelcomeEmailInput): { subject: string; html: string } {
  const name = escapeHtml(firstNameOf(input.firstName));
  return {
    subject: "Do you know what one missed booking is worth?",
    html:
      `<p>Hi ${name},</p>` +
      `<p>Start with a simple calculation:</p>` +
      `<p><strong>Additional completed jobs × average completed job value = additional gross revenue.</strong></p>` +
      `<p>This is not profit, and it is not a forecast. It is a way to understand why booking conversion and average ticket deserve attention alongside lead volume.</p>` +
      `<p>The SNIPE Diagnostic™ reviews the business data you have and identifies where the process deserves a closer look.</p>` +
      `<p><a href="${input.diagnosticLink}">Get your SNIPE Diagnostic™</a></p>` +
      `<p>GrowthSnipe</p>` +
      marketingFooter(input.unsubscribeUrl),
  };
}

export function loopWelcomeDay8(input: WelcomeEmailInput): { subject: string; html: string } {
  const name = escapeHtml(firstNameOf(input.firstName));
  return {
    subject: "When a workflow is not enough",
    html:
      `<p>Hi ${name},</p>` +
      `<p>A workflow can remind someone to follow up. It cannot decide your growth target, tell you whether your acquisition costs make sense or work out whether the business has capacity for more jobs.</p>` +
      `<p>That takes a plan built around your numbers.</p>` +
      `<p>The SNIPE Blueprint™ connects revenue targets, job volume, average ticket, channel economics, customer journeys and capacity into a 12-month plan.</p>` +
      `<p><a href="${input.blueprintLink}">Explore the SNIPE Blueprint™</a></p>` +
      `<p>GrowthSnipe</p>` +
      marketingFooter(input.unsubscribeUrl),
  };
}

export function loopWelcomeDay12(input: WelcomeEmailInput): { subject: string; html: string } {
  const name = escapeHtml(firstNameOf(input.firstName));
  return {
    subject: "Want a second set of eyes on your growth process?",
    html:
      `<p>Hi ${name},</p>` +
      `<p>The free Growth Fit Call is a 20-minute conversation about your business, your next-stage goal and the biggest obstacle in the way.</p>` +
      `<p>We will help determine whether your best next step is a Diagnostic or Blueprint, a SNIPE Engine™ conversation, or simply more time with the free resources.</p>` +
      `<p><a href="${input.bookLink}">Book your Growth Fit Call</a></p>` +
      `<p>GrowthSnipe</p>` +
      marketingFooter(input.unsubscribeUrl),
  };
}

export function buyerReminderContent(input: {
  firstName: string;
  kind: "diagnostic" | "blueprint";
  step: string;
  deadlineDate: string;
  actionLink: string;
  unsubscribeUrl: string;
}): { subject: string; html: string } {
  const name = escapeHtml(firstNameOf(input.firstName));
  if (input.kind === "diagnostic") {
    const daysLeft = input.step === "diag-d7" ? "7 days" : "2 days";
    return {
      subject: `Reminder: your Blueprint credit expires in ${daysLeft}`,
      html:
        `<p>Hi ${name},</p>` +
        `<p>Your Diagnostic fee is credited toward a SNIPE Blueprint™ purchased within 14 days of your readout. That window closes on ${escapeHtml(input.deadlineDate)}.</p>` +
        `<p><a href="${input.actionLink}">Get the Blueprint before the credit expires</a></p>` +
        `<p>GrowthSnipe</p>` +
        marketingFooter(input.unsubscribeUrl),
    };
  }
  const isCheckIn = input.step === "bp-d14";
  return {
    subject: isCheckIn ? "Two weeks in: how is the Blueprint landing?" : "Reminder: your SNIPE Engine™ setup credit expires soon",
    html:
      `<p>Hi ${name},</p>` +
      (isCheckIn
        ? `<p>It has been two weeks since your Blueprint presentation. Reply to this email with your implementation questions and we will help you through them.</p>`
        : `<p>Your Blueprint fee is credited toward SNIPE Engine™ setup if you sign within 30 days of your presentation, which ends on ${escapeHtml(input.deadlineDate)}.</p><p><a href="${input.actionLink}">Contact us for SNIPE Engine™ pricing</a></p>`) +
      `<p>GrowthSnipe</p>` +
      marketingFooter(input.unsubscribeUrl),
  };
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
  const brand = escapeHtml(input.portalName || "GrowthSnipe");
  const support = escapeHtml(input.supportEmail || "");
  const paragraphs = input.briefingText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px 0">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return {
    subject: `${input.portalName || "GrowthSnipe"} ${escapeHtml(input.periodLabel)} briefing for ${org}`,
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
  const brand = escapeHtml(input.portalName || "GrowthSnipe");
  const support = escapeHtml(input.supportEmail || "");
  return {
    subject: `${input.portalName || "GrowthSnipe"} Subscription - Payment Renewal Ahead!`,
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
