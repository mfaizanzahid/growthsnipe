import type { Env } from "../types";
import { nowSec } from "../lib/time";
import { computeProration } from "../lib/billing-math";
import { retreatBillingDate } from "../lib/billing-dates";
import type { BillingStore } from "../repositories/billing";
import { collectionOrder, resolveMethodToken, setPrimary } from "./methods";
import { decryptCustomerToken } from "./customers";
import { sendChargeReceipt, sendSubscriptionNotice } from "./mail";
import { BillingError } from "./errors";
import type { Gateway } from "./gateway";
import { isPrepaidTrial } from "./access";
import { logEvent } from "../lib/app-logs";

export interface ChangeInput {
  orgId: string;
  userId: string;
  newPlanId: string;
  newInterval: "month" | "year";
  recipientEmails: string[];
  /** Superadmin actor email for the audit trail. */
  actorEmail?: string | null;
}

export interface ChangeResult {
  kind: "upgrade" | "downgrade" | "noop";
  recurringMinor: number;
  proratedMinor: number;
  invoiceId?: string;
}

/**
 * Plan change policy (owner-confirmed):
 * - upgrade (higher recurring): prorated difference charged IMMEDIATELY
 *   (price delta × remaining cycle fraction), via the method cascade.
 * - downgrade (lower recurring): takes effect from the NEXT cycle, no charge.
 * - cancel: access until period end, then the Cron ignores the subscription.
 */
export async function changePlan(
  env: Env,
  store: BillingStore,
  gateway: Gateway,
  input: ChangeInput,
  now = nowSec(),
): Promise<ChangeResult> {
  const sub = await store.getOrgSubscription(input.orgId);
  if (!sub) throw new BillingError("No active subscription", 404);
  if (!["active", "trialing", "scheduled"].includes(sub.status)) {
    throw new BillingError(`Subscription is ${sub.status} — settle it first`, 422);
  }
  // A prepaid trial already paid for the period that starts when the trial
  // ends, so a plan change would charge a second time for the same period.
  if (isPrepaidTrial(sub) && sub.trialEndsAt != null && sub.trialEndsAt > now) {
    throw new BillingError(
      `Your plan starts on ${new Date(sub.trialEndsAt * 1000).toISOString().slice(0, 10)} — change it then`,
      409,
    );
  }
  const plan = await store.getPlan(input.newPlanId);
  if (!plan || plan.active !== 1) throw new BillingError("Plan is not available", 422);
  if (input.newInterval !== "month" && input.newInterval !== "year") {
    throw new BillingError("Interval must be month or year", 422);
  }

  const newRecurring = input.newInterval === "month" ? plan.monthlyMinor : plan.annualMinor;
  const oldRecurring = sub.recurringAmountMinor;
  if (newRecurring === oldRecurring && plan.id === sub.planId && input.newInterval === sub.interval) {
    return { kind: "noop", recurringMinor: oldRecurring, proratedMinor: 0 };
  }

  if (newRecurring < oldRecurring) {
    await store.updateSubscription(sub.id, {
      planId: plan.id,
      interval: input.newInterval,
      recurringAmountMinor: newRecurring,
      currency: sub.currency,
    });
    await detachInapplicableCoupon(store, sub.id, plan.id);
    await logEvent(env, {
      level: "info",
      event: "billing.plan_changed",
      surface: "billing",
      message: `Plan downgraded to ${plan.name} (${input.newInterval}) - effective next cycle`,
      orgId: input.orgId,
      userId: input.userId,
      userEmail: input.actorEmail ?? null,
      detail: {
        kind: "downgrade",
        planId: plan.id,
        planName: plan.name,
        interval: input.newInterval,
        recurringMinor: newRecurring,
        previousRecurringMinor: oldRecurring,
      },
    });
    return { kind: "downgrade", recurringMinor: newRecurring, proratedMinor: 0 };
  }

  // Upgrade: prorate over the remaining current cycle and charge now.
  const periodStart = retreatBillingDate(sub.nextCharge, sub.interval, sub.intervalCount ?? 1);
  const proratedMinor = computeProration({
    oldRecurringMinor: oldRecurring,
    newRecurringMinor: newRecurring,
    periodStartSec: periodStart,
    periodEndSec: sub.nextCharge,
    nowSec: now,
  });
  const actorNote = input.actorEmail ? ` — by ${input.actorEmail} (superadmin)` : "";

  let invoiceId: string | undefined;
  if (proratedMinor > 0) {
    const customerToken = await decryptCustomerToken(env, store, input.orgId);
    if (!customerToken) throw new BillingError("No Safepay customer for this organization", 422);
    const methods = await collectionOrder(store, input.orgId);
    let collected: { tracker: string; chargeId: string } | null = null;
    for (const method of methods) {
      let token: string;
      try {
        token = await resolveMethodToken(env, method);
      } catch {
        await store.updatePaymentMethod(method.id, { status: "failed" });
        continue;
      }
      try {
        const charge = await gateway.chargeSavedCard({
          customerToken,
          merchantApiKey: env.SAFEPAY_PUBLIC_KEY,
          paymentMethodToken: token,
          currency: sub.currency,
          amountMinor: proratedMinor,
        });
        collected = charge;
        await store.updatePaymentMethod(method.id, { status: "active" });
        if (method.isDefault !== 1) await setPrimary(store, input.orgId, method.id);
        break;
      } catch {
        await store.updatePaymentMethod(method.id, { status: "failed" });
        await store.insertTransaction({
          orgId: input.orgId,
          kind: "upgrade_proration",
          status: "failed",
          amountMinor: proratedMinor,
          currency: sub.currency,
          description: `Upgrade proration — ${plan.name}${actorNote}`,
        });
      }
    }
    if (!collected) throw new BillingError("Upgrade charge failed on all methods", 402);
    const invoice = await store.createInvoice(
      {
        id: crypto.randomUUID(),
        orgId: input.orgId,
        subscriptionId: sub.id,
        type: "subscription",
        status: "paid",
        amountMinor: proratedMinor,
        currency: sub.currency,
        description: `Upgrade proration — ${plan.name}`,
        tracker: collected.tracker,
        chargeId: collected.chargeId,
        dueAt: now,
        paidAt: now,
        createdBy: input.userId,
      },
      [{ description: `Upgrade proration — ${plan.name}`, amountMinor: proratedMinor }],
      now,
    );
    invoiceId = invoice.id;
    await store.insertTransaction({
      orgId: input.orgId,
      invoiceId: invoice.id,
      tracker: collected.tracker,
      chargeId: collected.chargeId,
      kind: "upgrade_proration",
      status: "succeeded",
      amountMinor: proratedMinor,
      currency: sub.currency,
      description: `Upgrade proration — ${plan.name}${actorNote}`,
    });
    await sendChargeReceipt(env, store, input.recipientEmails, {
      invoiceNumber: invoice.number ?? invoice.id,
      amountMinor: proratedMinor,
      currency: sub.currency,
      planName: plan.name,
    });
  }

  await store.updateSubscription(sub.id, {
    planId: plan.id,
    interval: input.newInterval,
    recurringAmountMinor: newRecurring,
    currency: sub.currency,
  });
  await detachInapplicableCoupon(store, sub.id, plan.id);
  await logEvent(env, {
    level: "info",
    event: "billing.plan_changed",
    surface: "billing",
    message: `Plan upgraded to ${plan.name} (${input.newInterval})`,
    orgId: input.orgId,
    userId: input.userId,
    userEmail: input.actorEmail ?? null,
    detail: {
      kind: "upgrade",
      planId: plan.id,
      planName: plan.name,
      interval: input.newInterval,
      recurringMinor: newRecurring,
      previousRecurringMinor: oldRecurring,
      proratedMinor,
      invoiceId: invoiceId ?? null,
    },
  });
  return { kind: "upgrade", recurringMinor: newRecurring, proratedMinor, invoiceId };
}

async function detachInapplicableCoupon(
  store: BillingStore,
  subscriptionId: string,
  planId: string,
): Promise<void> {
  const attach = await store.activeSubscriptionCoupon(subscriptionId);
  if (!attach) return;
  const applicable = await store.listCouponPlans(attach.couponId);
  if (applicable.length > 0 && !applicable.includes(planId)) {
    await store.advanceSubscriptionCoupon(attach.id, attach.cyclesApplied, "removed");
  }
}

/** Cancel at period end: access continues until nextCharge; Cron ignores canceled rows. */
export async function cancelSubscription(
  env: Env,
  store: BillingStore,
  orgId: string,
  userId: string,
  recipientEmails: string[],
  now = nowSec(),
): Promise<{ subscriptionId: string; accessUntil: number }> {
  const sub = await store.getOrgSubscription(orgId);
  if (!sub) throw new BillingError("No active subscription", 404);
  if (sub.status === "canceled") throw new BillingError("Subscription is already canceled", 409);
  await store.updateSubscription(sub.id, {
    status: "canceled",
    canceledAt: now,
    currency: sub.currency,
    recurringAmountMinor: sub.recurringAmountMinor,
  });
  const plan = await store.getPlan(sub.planId);
  await sendSubscriptionNotice(env, store, recipientEmails, "canceled", plan?.name ?? "Subscription");
  await logEvent(env, {
    level: "info",
    event: "billing.subscription_cancelled",
    surface: "billing",
    message: `Subscription to ${plan?.name ?? "Subscription"} cancelled - access until period end`,
    orgId,
    userId,
    detail: {
      subscriptionId: sub.id,
      planId: sub.planId,
      planName: plan?.name ?? null,
      accessUntil: sub.nextCharge,
    },
  });
  return { subscriptionId: sub.id, accessUntil: sub.nextCharge };
}
