import type { Env } from "../types";
import { PORTAL_NAME } from "../lib/brand";
import { nowSec } from "../lib/time";
import { advanceBillingDate } from "../lib/billing-dates";
import { computeSignupAmounts, dunningDue } from "../lib/billing-math";
import { withIdem, requestHashFor, DuplicateIdempotencyError, type IdempotencyBackend } from "../lib/idempotency";
import type { BillingStore, SubscriptionRow } from "../repositories/billing";
import { collectionOrder, resolveMethodToken, retryOrder, setPrimary } from "./methods";
import { decryptCustomerToken } from "./customers";
import {
  sendAccountCancelled,
  sendCancelWarning,
  sendChargeReceipt,
  sendDunningReminder,
  sendPaymentFailed,
  sendRenewalReminder,
  sendSubscriptionNotice,
} from "./mail";
import type { Gateway } from "./gateway";
import { logEvent } from "../lib/app-logs";

/**
 * Auto-retry policy, per saved card: initial attempt + at most 2 automatic
 * retries (3 attempts per card per overdue invoice), at least 24h apart.
 * Valid and failed cards are all retried — the budget is per card, not per
 * invoice, so a newly added card always gets its own attempts.
 */
export const MAX_AUTO_ATTEMPTS_PER_METHOD = 3;
/** Minimum gap between automatic attempts on the same card (seconds). */
export const AUTO_RETRY_GAP_SEC = 86400;
/** Days overdue before the cancel-warning email goes out. */
export const PAST_DUE_WARNING_DAYS = 20;
/** Days overdue before the subscription auto-cancels for non-payment. */
export const PAST_DUE_CANCEL_DAYS = 25;

export interface RenewalSummary {
  checked: number;
  charged: number;
  failed: number;
  reminders: number;
  renewalReminders: number;
  warned: number;
  canceled: number;
}

/** Daily Cron entry: charge due periods, then dunning + renewal + past-due expiry. */
export async function processDueSubscriptions(
  env: Env,
  store: BillingStore,
  idem: IdempotencyBackend,
  gateway: Gateway,
  now = nowSec(),
): Promise<RenewalSummary> {
  const due = await store.dueSubscriptions(now);
  let charged = 0;
  let failed = 0;
  for (const sub of due) {
    try {
      const ok = await chargePeriod(env, store, idem, gateway, sub.id, { now });
      if (ok) charged += 1;
      else failed += 1;
    } catch (err) {
      // A concurrent run owns this period — skip silently, it is (being) collected.
      if (err instanceof DuplicateIdempotencyError) continue;
      failed += 1;
    }
  }
  const reminders = await sendDueReminders(env, store, now);
  const renewalReminders = await sendRenewalReminders(env, store, now);
  const expiry = await processPastDueExpiry(env, store, now);
  return {
    checked: due.length,
    charged,
    failed,
    reminders,
    renewalReminders,
    warned: expiry.warned,
    canceled: expiry.canceled,
  };
}

/** Two days before each renewal, warn org admins (once per billing period). */
export async function sendRenewalReminders(
  env: Env,
  store: BillingStore,
  now = nowSec(),
): Promise<number> {
  const upcoming = await store.upcomingSubscriptions(now, now + 2 * 86400);
  let sent = 0;
  const settings = await store.getAllSettings();
  for (const sub of upcoming) {
    if (sub.renewalReminderFor === sub.nextCharge) continue;
    const methods = await collectionOrder(store, sub.orgId);
    if (methods.length === 0) continue;
    const admins = (await store.listOrgMembers(sub.orgId)).filter(
      (m) => m.role === "admin" && m.status === "active",
    );
    if (admins.length === 0) continue;
    await sendRenewalReminder(
      env,
      admins.map((a) => ({ email: a.email, name: a.name })),
      {
        nextChargeSec: sub.nextCharge,
        amountMinor: sub.recurringAmountMinor,
        currency: sub.currency,
        interval: sub.interval,
        billingUrl: `${env.APP_BASE_URL ?? ""}/billing`,
        portalName: PORTAL_NAME,
        supportEmail: settings.support_email ?? "",
      },
    );
    await store.updateSubscription(sub.id, { renewalReminderFor: sub.nextCharge });
    sent += 1;
  }
  return sent;
}

interface PeriodDiscount {
  amountMinor: number;
  attachId: string | null;
}

/** Resolve the renewal-period discount from the attached coupon, if any. */
async function periodDiscount(
  store: BillingStore,
  sub: SubscriptionRow,
  recurringMinor: number,
): Promise<PeriodDiscount> {
  const none: PeriodDiscount = { amountMinor: 0, attachId: null };
  const attach = await store.activeSubscriptionCoupon(sub.id);
  if (!attach) return none;
  const coupon = await store.getCouponById(attach.couponId);
  if (!coupon || coupon.active !== 1) return none;
  if (coupon.duration === "once") {
    // Once-coupons apply at signup only; retire the attachment.
    await store.advanceSubscriptionCoupon(attach.id, attach.cyclesApplied, "exhausted");
    return none;
  }
  if (coupon.duration === "repeating") {
    const cycles = coupon.durationCycles ?? 0;
    if (cycles <= 0 || attach.cyclesApplied >= cycles) {
      await store.advanceSubscriptionCoupon(attach.id, attach.cyclesApplied, "exhausted");
      return none;
    }
  }
  const amounts = computeSignupAmounts({
    setupMinor: 0,
    recurringMinor,
    coupon: {
      kind: coupon.kind as "percent" | "fixed",
      percentOff: coupon.percentOff,
      amountOffMinor: coupon.amountOffMinor,
      appliesToSetup: 0,
    },
  });
  return { amountMinor: amounts.recurringDiscountMinor, attachId: attach.id };
}

/**
 * Collect one billing period for a subscription with fallback cascade.
 * Returns true when the period completed. Advances nextCharge ONLY on success.
 *
 * Once-only guarantee: the whole collection runs under the per-period key
 * `renew:{subscription}:{nextCharge}`. Concurrent runs for the same period
 * (overlapping Crons, double-clicked manual triggers) collapse into one
 * collection; the loser sees DuplicateIdempotencyError. Failed attempts
 * release the key so the next scheduled run retries normally.
 */
export async function chargePeriod(
  env: Env,
  store: BillingStore,
  idem: IdempotencyBackend,
  gateway: Gateway,
  subscriptionId: string,
  opts?: { now?: number },
): Promise<boolean> {
  const now = opts?.now ?? nowSec();
  const sub = await store.getSubscription(subscriptionId);
  if (!sub) return false;
  // Trials are owned by the trial processor (no card on file) — never charge.
  if (!["active", "past_due"].includes(sub.status)) return false;
  if (sub.nextCharge > now) return false;
  // Per-card budgets are enforced inside collectPeriod (skipped cards simply
  // aren't attempted; when nothing is eligible the period stays manual-only).

  const key = `renew:${sub.id}:${sub.nextCharge}`;
  const hash = await requestHashFor({
    subscriptionId: sub.id,
    periodBillingDate: sub.nextCharge,
    recurringMinor: sub.recurringAmountMinor,
    currency: sub.currency,
  });
  const { result } = await withIdem(idem, key, hash, "renewal", () =>
    collectPeriod(env, store, gateway, sub.id, now),
  );
  if (!result) {
    // Failed collections must not cache: release the key so the next
    // scheduled run retries (subject to the auto-retry cap above).
    // Swallow release errors — the period simply stays retryable.
    try {
      await idem.release(key);
    } catch {
      /* noop */
    }
  }
  return result;
}

/**
 * Per-card auto-retry guard for one overdue invoice: at most one attempt per
 * card per day, at most MAX_AUTO_ATTEMPTS_PER_METHOD attempts per card.
 * Legacy transactions without a paymentMethodId are ignored (fresh budget).
 */
export async function methodRetryBlocked(
  store: BillingStore,
  invoiceId: string,
  methodId: string,
  now: number,
): Promise<boolean> {
  const txns = await store.listTransactionsForInvoice(invoiceId);
  const failed = txns.filter(
    (t) => t.kind === "renewal" && t.status === "failed" && t.paymentMethodId === methodId,
  );
  if (failed.length === 0) return false;
  if (failed.length >= MAX_AUTO_ATTEMPTS_PER_METHOD) return true;
  const lastMs = Math.max(...failed.map((t) => Number(t.createdAt)));
  return now - Math.floor(lastMs / 1000) < AUTO_RETRY_GAP_SEC;
}

/**
 * Past-due endgame: at 20 days overdue warn once (account closes in 5 days),
 * at 25 days cancel for non-payment and suspend access. Manual pay
 * (POST /api/billing/invoices/:id/pay) remains the only charge path once
 * auto-retries are exhausted — this function never charges.
 */
export async function processPastDueExpiry(
  env: Env,
  store: BillingStore,
  now = nowSec(),
): Promise<{ warned: number; canceled: number }> {
  let warned = 0;
  let canceled = 0;
  const all = await store.listAllSubscriptions();
  for (const sub of all) {
    if (sub.status !== "past_due" || sub.pastDueSince == null) continue;
    const daysOverdue = Math.floor((now - sub.pastDueSince) / 86400);
    if (daysOverdue < PAST_DUE_WARNING_DAYS) continue;
    const recipients = await store.listOrgAdminEmails(sub.orgId);
    if (recipients.length === 0) continue;
    const plan = await store.getPlan(sub.planId);
    const planName = plan?.name ?? "Subscription";
    if (daysOverdue >= PAST_DUE_CANCEL_DAYS) {
      await store.updateSubscription(sub.id, {
        status: "canceled",
        canceledAt: now,
        currency: sub.currency,
        recurringAmountMinor: sub.recurringAmountMinor,
      });
      await sendSubscriptionNotice(env, store, recipients, "canceled", planName);
      await sendAccountCancelled(env, store, recipients, planName);
      canceled += 1;
      continue;
    }
    const invoice = await store.findOpenInvoiceForSubscription(sub.id);
    if (!invoice) continue;
    // reminderCount 6 marks the 20-day warning as sent (dunning caps at 5).
    if ((invoice.reminderCount ?? 0) >= 6) continue;
    await sendCancelWarning(env, store, recipients, {
      invoiceNumber: invoice.number ?? invoice.id,
      amountMinor: invoice.amountMinor,
      currency: invoice.currency,
      cancelDateSec: sub.pastDueSince + PAST_DUE_CANCEL_DAYS * 86400,
    });
    await store.updateInvoice(invoice.id, { reminderCount: 6, lastReminderAt: now });
    warned += 1;
  }
  return { warned, canceled };
}

async function collectPeriod(
  env: Env,
  store: BillingStore,
  gateway: Gateway,
  subscriptionId: string,
  now: number,
): Promise<boolean> {
  const sub = await store.getSubscription(subscriptionId);
  if (!sub) return false;

  const plan = await store.getPlan(sub.planId);
  const planName = plan?.name ?? "Subscription";
  const recipients = await store.listOrgAdminEmails(sub.orgId);

  const discount = await periodDiscount(store, sub, sub.recurringAmountMinor);
  const amountMinor = Math.max(0, sub.recurringAmountMinor - discount.amountMinor);

  let invoice = await store.findOpenInvoiceForSubscription(sub.id);
  if (!invoice) {
    invoice = await store.createInvoice(
      {
        id: crypto.randomUUID(),
        orgId: sub.orgId,
        subscriptionId: sub.id,
        type: "subscription",
        status: "due",
        amountMinor,
        currency: sub.currency,
        description: `${planName} — renewal`,
        dueAt: now,
        createdBy: null,
      },
      [
        { description: `${planName} — renewal`, amountMinor: sub.recurringAmountMinor },
        ...(discount.amountMinor > 0
          ? [{ description: "Discount — renewal", amountMinor: -discount.amountMinor }]
          : []),
      ],
      now,
    );
  }
  const invoiceNumber = invoice.number ?? invoice.id;

  const customerToken = await decryptCustomerToken(env, store, sub.orgId);
  // Overdue retries run against every saved card (valid or failed), each
  // with its own per-card budget (at most one attempt per card per day).
  const methods = await retryOrder(store, sub.orgId);
  const triedFailed: string[] = [];

  if (customerToken && methods.length > 0 && amountMinor > 0) {
    for (const method of methods) {
      if (await methodRetryBlocked(store, invoice.id, method.id, now)) continue;
      let methodToken: string;
      try {
        methodToken = await resolveMethodToken(env, method);
      } catch {
        triedFailed.push(method.id);
        continue;
      }
      try {
        const charge = await gateway.chargeSavedCard({
          customerToken,
          merchantApiKey: env.SAFEPAY_PUBLIC_KEY,
          paymentMethodToken: methodToken,
          currency: sub.currency,
          amountMinor,
        });
        await store.insertTransaction({
          orgId: sub.orgId,
          invoiceId: invoice.id,
          paymentMethodId: method.id,
          tracker: charge.tracker,
          chargeId: charge.chargeId,
          kind: "renewal",
          status: "succeeded",
          amountMinor,
          currency: sub.currency,
          description: `${planName} — renewal`,
        });
        await store.updateInvoice(invoice.id, {
          status: "paid",
          tracker: charge.tracker,
          chargeId: charge.chargeId,
          paidAt: now,
        });
        const wasPastDue = sub.status === "past_due";
        const nextCharge = advanceBillingDate(sub.nextCharge, sub.interval, sub.intervalCount ?? 1);
        const cyclesCharged = (sub.cyclesCharged ?? 0) + 1;
        const completed =
          sub.totalCycles !== null &&
          sub.totalCycles !== undefined &&
          cyclesCharged >= sub.totalCycles;
        await store.updateSubscription(sub.id, {
          status: completed ? "expired" : "active",
          nextCharge,
          cyclesCharged,
          pastDueSince: null,
          defaultPaymentMethodId: method.id,
          currency: sub.currency,
          recurringAmountMinor: sub.recurringAmountMinor,
        });
        // A winning card is valid again — mark it active first so a
        // previously-failed backup can be auto-promoted to primary.
        await store.updatePaymentMethod(method.id, { status: "active" });
        if (method.isDefault !== 1) {
          await setPrimary(store, sub.orgId, method.id);
        }
        for (const failedId of triedFailed) {
          await store.updatePaymentMethod(failedId, { status: "failed" });
        }
        if (discount.attachId) {
          const attach = await store.activeSubscriptionCoupon(sub.id);
          if (attach) {
            await store.advanceSubscriptionCoupon(attach.id, attach.cyclesApplied + 1, "active");
          }
        }
        await sendChargeReceipt(env, store, recipients, {
          invoiceNumber,
          amountMinor,
          currency: sub.currency,
          planName,
        });
        if (wasPastDue) {
          await sendSubscriptionNotice(env, store, recipients, "active", planName);
        }
        await logEvent(env, {
          level: "info",
          event: "billing.charge_succeeded",
          surface: "billing",
          message: `Renewal charge succeeded for ${planName}`,
          orgId: sub.orgId,
          statusCode: 200,
          detail: {
            invoiceNumber,
            amountMinor,
            currency: sub.currency,
            kind: "renewal",
            recovered: wasPastDue,
          },
        });
        return true;
      } catch {
        triedFailed.push(method.id);
        await store.insertTransaction({
          orgId: sub.orgId,
          invoiceId: invoice.id,
          paymentMethodId: method.id,
          kind: "renewal",
          status: "failed",
          amountMinor,
          currency: sub.currency,
          description: `${planName} — renewal attempt`,
        });
      }
    }
  }

  // All methods failed (or none available): mark failed, start/continue dunning.
  for (const failedId of triedFailed) {
    await store.updatePaymentMethod(failedId, { status: "failed" });
  }
  const newlyFailed = invoice.status !== "failed";
  await store.updateInvoice(invoice.id, { status: "failed" });
  if (newlyFailed) {
    await store.updateInvoice(invoice.id, { reminderCount: 1, lastReminderAt: now });
    await store.updateSubscription(sub.id, {
      status: "past_due",
      pastDueSince: sub.pastDueSince ?? now,
      currency: sub.currency,
      recurringAmountMinor: sub.recurringAmountMinor,
    });
    await sendPaymentFailed(env, store, recipients, {
      invoiceNumber,
      amountMinor,
      currency: sub.currency,
      attempt: methods.length === 0 ? "no valid payment method" : "all payment methods failed",
    });
    await sendSubscriptionNotice(env, store, recipients, "past_due", planName);
    await logEvent(env, {
      level: "error",
      event: "billing.charge_failed",
      surface: "billing",
      message: `Renewal charge failed for ${planName} - subscription is past due`,
      orgId: sub.orgId,
      statusCode: 402,
      detail: {
        invoiceNumber,
        amountMinor,
        currency: sub.currency,
        kind: "renewal",
        attempt: methods.length === 0 ? "no valid payment method" : "all payment methods failed",
      },
    });
  }
  return false;
}

/** Send scheduled dunning reminders for failed invoices of past-due subscriptions. */
export async function sendDueReminders(
  env: Env,
  store: BillingStore,
  now = nowSec(),
): Promise<number> {
  const failed = await store.listFailedInvoices();
  let sent = 0;
  for (const invoice of failed) {
    if (!invoice.subscriptionId) continue;
    const sub = await store.getSubscription(invoice.subscriptionId);
    if (!sub || sub.status !== "past_due" || sub.orgId !== invoice.orgId) continue;
    const latest = await store.findOpenInvoiceForSubscription(sub.id);
    if (!latest || latest.id !== invoice.id) continue;
    if (
      !dunningDue({
        reminderCount: invoice.reminderCount ?? 0,
        lastReminderAtSec: invoice.lastReminderAt,
        nowSec: now,
      })
    ) {
      continue;
    }
    const recipients = await store.listOrgAdminEmails(sub.orgId);
    if (recipients.length === 0) continue;
    const final = (invoice.reminderCount ?? 0) >= 4;
    await sendDunningReminder(env, store, recipients, {
      invoiceNumber: invoice.number ?? invoice.id,
      amountMinor: invoice.amountMinor,
      currency: invoice.currency,
      final,
    });
    await store.updateInvoice(invoice.id, {
      reminderCount: (invoice.reminderCount ?? 0) + 1,
      lastReminderAt: now,
    });
    sent += 1;
  }
  return sent;
}
