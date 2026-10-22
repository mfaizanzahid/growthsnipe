import type { Env } from "../types";
import { nowSec } from "../lib/time";
import { withIdem, requestHashFor, type IdempotencyBackend } from "../lib/idempotency";
import { computeSignupAmounts } from "../lib/billing-math";
import { advanceBillingDate, utcMidnight } from "../lib/billing-dates";
import type { BillingStore } from "../repositories/billing";
import { consumeRedemption, validateCoupon, CouponError } from "./coupons";
import { syncWalletMethods } from "./methods";
import { sendChargeReceipt, sendSubscriptionNotice, sendTrialReminder } from "./mail";
import { BillingError } from "./errors";
import type { Gateway } from "./gateway";
import { TRIAL_DAYS, TRIAL_PLAN_ID, isPrepaidTrial } from "./access";
import { logEvent } from "../lib/app-logs";

export { TRIAL_PLAN_ID };

/** UTC calendar day (YYYY-MM-DD) for invoice and email copy. */
function formatDayUtc(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

function parseReminders(raw: string | null): number[] {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

export interface TrialStartInput {
  orgId: string;
  userId: string;
}

/**
 * Start the 30-day Pro trial (first organization only — the route verifies
 * eligibility). No card, no charge, no invoice. Idempotent per org.
 */
export async function startTrial(
  store: BillingStore,
  input: TrialStartInput,
  now = nowSec(),
): Promise<{ subscriptionId: string; trialEndsAt: number }> {
  const existing = await store.getOrgSubscription(input.orgId);
  if (existing) throw new BillingError("This organization already has a subscription", 409);
  const plan = await store.getPlan(TRIAL_PLAN_ID);
  if (!plan || plan.active !== 1) throw new BillingError("Trial plan is not available", 422);
  const trialEndsAt = now + TRIAL_DAYS * 86400;
  const sub = await store.insertSubscription({
    id: crypto.randomUUID(),
    orgId: input.orgId,
    planId: plan.id,
    interval: "month",
    intervalCount: 1,
    status: "trialing",
    startDate: now,
    nextCharge: trialEndsAt,
    totalCycles: null,
    cyclesCharged: 0,
    recurringAmountMinor: plan.monthlyMinor,
    currency: plan.currency,
    defaultPaymentMethodId: null,
    pastDueSince: null,
    trialEndsAt,
    trialReminders: "[]",
    trialPrepaid: 0,
    renewalReminderFor: null,
    canceledAt: null,
    createdBy: input.userId,
  });
  return { subscriptionId: sub.id, trialEndsAt };
}

export interface SubscribeInput {
  orgId: string;
  userId: string;
  planId: string;
  interval: "month" | "year";
  couponCode?: string | null;
  tracker?: string | null;
  idempotencyKey?: string | null;
  recipientEmails: string[];
}

/**
 * Start a paid subscription immediately: converts a trialing/trial_expired
 * subscription, or creates one for an org that never trialed (second orgs).
 * Same session trust chain as signup. First paid period starts now.
 */
export async function subscribe(
  env: Env,
  store: BillingStore,
  idem: IdempotencyBackend,
  gateway: Gateway,
  input: SubscribeInput,
  now = nowSec(),
): Promise<{
  cached: boolean;
  result: {
    subscriptionId: string;
    invoiceId: string;
    invoiceNumber: string;
    totalMinor: number;
    nextCharge: number;
    /** True when this was a trial converted to a prepaid plan that starts at trial end. */
    prepaid: boolean;
    /** When the paid plan starts (trial end), for a prepaid trial. */
    planStartsAt: number | null;
  };
}> {
  const plan = await store.getPlan(input.planId);
  if (!plan || plan.active !== 1) throw new BillingError("Plan is not available", 422);
  if (input.interval !== "month" && input.interval !== "year") {
    throw new BillingError("Interval must be month or year", 422);
  }
  if (plan.currency !== "USD") throw new BillingError("Only USD billing is supported", 422);

  const existing = await store.getOrgSubscription(input.orgId);
  if (existing && existing.status === "active") {
    throw new BillingError("This organization already has an active subscription — change plans instead", 409);
  }
  if (existing && isPrepaidTrial(existing)) {
    throw new BillingError(
      "This organization already has a plan that starts when the trial ends",
      409,
    );
  }
  if (existing && !["trialing", "trial_expired"].includes(existing.status)) {
    throw new BillingError(`Subscription is ${existing.status} — settle it first`, 422);
  }

  let couponTerms = null;
  let couponId: string | null = null;
  if (input.couponCode) {
    try {
      const valid = await validateCoupon(store, input.couponCode, plan.id, now);
      couponTerms = valid.terms;
      couponId = valid.coupon.id;
    } catch (err) {
      if (err instanceof CouponError) throw new BillingError(err.message, err.status);
      throw err;
    }
  }

  const recurringMinor = input.interval === "month" ? plan.monthlyMinor : plan.annualMinor;
  const amounts = computeSignupAmounts({ setupMinor: plan.setupFeeMinor, recurringMinor, coupon: couponTerms });

  const key = input.idempotencyKey ?? `subscribe:v2:${input.orgId}:${input.planId}:${input.interval}:${input.tracker ?? "free"}`;
  const hash = await requestHashFor({
    orgId: input.orgId,
    planId: plan.id,
    interval: input.interval,
    couponCode: input.couponCode ?? null,
    tracker: input.tracker ?? null,
    totalMinor: amounts.totalMinor,
  });

  return withIdem(idem, key, hash, "subscribe", async (): Promise<{
    subscriptionId: string;
    invoiceId: string;
    invoiceNumber: string;
    totalMinor: number;
    nextCharge: number;
    prepaid: boolean;
    planStartsAt: number | null;
  }> => {
    const current = await store.getOrgSubscription(input.orgId);
    if (current && current.status === "active") {
      throw new BillingError("This organization already has an active subscription — change plans instead", 409);
    }
    if (current && isPrepaidTrial(current)) {
      throw new BillingError("This organization already has a plan that starts when the trial ends", 409);
    }

    let tracker: string | null = null;
    let chargeId: string | null = null;
    if (amounts.totalMinor > 0) {
      if (!input.tracker) throw new BillingError("Payment is required", 402);
      const session = await store.getPaymentSession(input.tracker);
      if (!session || session.orgId !== input.orgId) throw new BillingError("Payment session is invalid", 422);
      if (session.amountMinor !== amounts.totalMinor || session.currency !== plan.currency) {
        throw new BillingError("Payment amount does not match the order total", 422);
      }
      if (session.status !== "pending" && session.status !== "succeeded") {
        throw new BillingError("Payment session is invalid or already used", 422);
      }
      const status = await gateway.checkTrackerStatus(input.tracker);
      if (status !== "succeeded") throw new BillingError("Payment has not completed", 402);
      tracker = input.tracker;
      chargeId = input.tracker;
      await store.markPaymentSession(input.tracker, "succeeded");
    }

    const { methods } = await syncWalletMethods(env, store, gateway, input.orgId, input.userId);
    const primary = methods.find((m) => m.isDefault === 1 && m.status === "active") ?? methods[0];
    if (amounts.totalMinor > 0 && !primary) {
      throw new BillingError("No saved payment method found after payment", 422);
    }

    // Subscribing DURING a trial: the first period is charged now, but the
    // trial tier (Pro features) still applies until the trial ends. The paid
    // plan starts on trial_ends_at, so the renewal date follows the trial
    // instead of the day they subscribed.
    const trialEndsAt =
      current && current.status === "trialing" && current.trialEndsAt != null && current.trialEndsAt > now
        ? current.trialEndsAt
        : null;
    const prepaid = trialEndsAt !== null;
    const firstBilling = utcMidnight(now);
    const nextCharge = prepaid
      ? advanceBillingDate(trialEndsAt as number, input.interval, 1)
      : advanceBillingDate(firstBilling, input.interval, 1);
    let subscriptionId: string;
    if (current) {
      subscriptionId = current.id;
      await store.updateSubscription(current.id, {
        planId: plan.id,
        interval: input.interval,
        status: prepaid ? "trialing" : "active",
        startDate: firstBilling,
        nextCharge,
        cyclesCharged: 1,
        recurringAmountMinor: recurringMinor,
        currency: plan.currency,
        defaultPaymentMethodId: primary?.id ?? null,
        pastDueSince: null,
        // A prepaid trial keeps its trial end (that is when the plan starts);
        // a plain conversion clears the stale trial window.
        trialPrepaid: prepaid ? 1 : 0,
        ...(prepaid ? {} : { trialEndsAt: null, trialReminders: "[]" }),
      });
    } else {
      subscriptionId = crypto.randomUUID();
      await store.insertSubscription({
        id: subscriptionId,
        orgId: input.orgId,
        planId: plan.id,
        interval: input.interval,
        intervalCount: 1,
        status: "active",
        startDate: firstBilling,
        nextCharge,
        totalCycles: null,
        cyclesCharged: 1,
        recurringAmountMinor: recurringMinor,
        currency: plan.currency,
        defaultPaymentMethodId: primary?.id ?? null,
        pastDueSince: null,
        trialEndsAt: null,
        trialReminders: "[]",
        trialPrepaid: 0,
        renewalReminderFor: null,
        canceledAt: null,
        createdBy: input.userId,
      });
    }

    const periodNote = prepaid
      ? ` (first period, starts ${formatDayUtc(trialEndsAt as number)})`
      : " (first period)";
    const lines = [
      ...(amounts.setupMinor > 0
        ? [{ description: `Setup fee — ${plan.name}`, amountMinor: amounts.setupMinor }]
        : []),
      {
        description: `${plan.name} — ${input.interval === "month" ? "monthly" : "yearly"}${periodNote}`,
        amountMinor: amounts.recurringMinor,
      },
      ...(amounts.setupDiscountMinor > 0
        ? [{ description: "Discount — setup fee", amountMinor: -amounts.setupDiscountMinor }]
        : []),
      ...(amounts.recurringDiscountMinor > 0
        ? [{ description: "Discount — first period", amountMinor: -amounts.recurringDiscountMinor }]
        : []),
    ];
    const invoice = await store.createInvoice(
      {
        id: crypto.randomUUID(),
        orgId: input.orgId,
        subscriptionId,
        type: "subscription",
        status: "paid",
        amountMinor: amounts.totalMinor,
        currency: plan.currency,
        description: `Subscribe — ${plan.name}`,
        idempotencyKey: key,
        tracker,
        chargeId,
        dueAt: now,
        paidAt: now,
        createdBy: input.userId,
      },
      lines,
      now,
    );

    await store.insertTransaction({
      orgId: input.orgId,
      invoiceId: invoice.id,
      tracker,
      chargeId,
      kind: "signup_charge",
      status: "succeeded",
      amountMinor: amounts.totalMinor,
      currency: plan.currency,
      description: `Subscribe — ${plan.name}`,
    });

    if (couponId) {
      await store.attachSubscriptionCoupon(subscriptionId, couponId);
      await consumeRedemption(store, couponId);
    }

    await sendChargeReceipt(env, store, input.recipientEmails, {
      invoiceNumber: invoice.number ?? invoice.id,
      amountMinor: amounts.totalMinor,
      currency: plan.currency,
      planName: plan.name,
      // A prepaid trial: the plan starts when the trial ends, so say so.
      planStartsAt: prepaid ? (trialEndsAt as number) : null,
    });
    if (!prepaid) {
      await sendSubscriptionNotice(env, store, input.recipientEmails, "active", plan.name);
    }
    await logEvent(env, {
      level: "info",
      event: "billing.subscription_started",
      surface: "billing",
      message: `Subscribed to ${plan.name} (${input.interval})`,
      orgId: input.orgId,
      userId: input.userId,
      detail: {
        planId: plan.id,
        planName: plan.name,
        interval: input.interval,
        invoiceNumber: invoice.number ?? invoice.id,
        totalMinor: amounts.totalMinor,
        currency: plan.currency,
        couponCode: input.couponCode ?? null,
        prepaidTrial: prepaid,
        planStartsAt: prepaid ? trialEndsAt : null,
      },
    });

    return {
      subscriptionId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number ?? invoice.id,
      totalMinor: amounts.totalMinor,
      nextCharge,
      prepaid,
      planStartsAt: prepaid ? trialEndsAt : null,
    };
  });
}

export interface TrialProcessResult {
  remindersSent: number;
  expired: number;
  /** Prepaid trials that were switched to their paid plan this run. */
  activated: number;
}

/**
 * Daily trial ownership: pre-expiry reminders (5/3/0 days left), expiry flip
 * to trial_expired, and post-expiry nudges (3/5 days overdue). Each offset
 * fires once per subscription (trial_reminders ledger).
 *
 * A prepaid trial (subscribed during the trial) is handled apart: the customer
 * has already paid, so there are no reminders and no expiry - the paid plan
 * simply starts when the trial ends.
 */
export async function processTrials(
  env: Env,
  store: BillingStore,
  adminEmailsFor: (orgId: string) => Promise<string[]>,
  now = nowSec(),
  onTrialActivated?: (orgId: string, planId: string) => Promise<void>,
): Promise<TrialProcessResult> {
  const subs = await store.listAllSubscriptions();
  let remindersSent = 0;
  let expired = 0;
  let activated = 0;
  for (const sub of subs) {
    if (sub.status !== "trialing" && sub.status !== "trial_expired") continue;
    if (sub.trialEndsAt == null) continue;
    if (isPrepaidTrial(sub)) {
      if (sub.status !== "trialing" || now <= sub.trialEndsAt) continue;
      // The trial is over and the plan is paid for: switch the row over to the
      // paid plan and apply its limits (the trial tier applies up to here).
      const plan = await store.getPlan(sub.planId);
      await store.updateSubscription(sub.id, {
        status: "active",
        trialPrepaid: 0,
        trialEndsAt: null,
        trialReminders: "[]",
      });
      activated += 1;
      const recipients = await adminEmailsFor(sub.orgId);
      if (recipients.length > 0) {
        await sendSubscriptionNotice(env, store, recipients, "active", plan?.name ?? "your plan");
      }
      if (onTrialActivated) await onTrialActivated(sub.orgId, sub.planId);
      continue;
    }
    const sent = parseReminders(sub.trialReminders);
    const markSent = async (offset: number) => {
      await store.updateSubscription(sub.id, { trialReminders: JSON.stringify([...sent, offset]) });
      sent.push(offset);
    };
    const notify = async (offset: -5 | -3 | 0 | 3 | 5, ended: boolean) => {
      if (sent.includes(offset)) return;
      const recipients = await adminEmailsFor(sub.orgId);
      if (recipients.length > 0) {
        await sendTrialReminder(env, store, recipients, offset, ended);
        remindersSent += 1;
      }
      await markSent(offset);
    };
    if (sub.status === "trialing" && now > sub.trialEndsAt) {
      await store.updateSubscription(sub.id, { status: "trial_expired" });
      expired += 1;
      await notify(0, true);
      continue;
    }
    const offset = Math.floor((now - sub.trialEndsAt) / 86400);
    if (sub.status === "trialing") {
      if (offset <= 0 && (offset === -5 || offset === -3 || offset === 0)) {
        await notify(offset, false);
      }
    } else if (offset === 3 || offset === 5) {
      await notify(offset, true);
    }
  }
  return { remindersSent, expired, activated };
}
