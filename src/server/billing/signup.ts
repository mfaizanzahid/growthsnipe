import type { Env } from "../types";
import { nowSec } from "../lib/time";
import { withIdem, requestHashFor, type IdempotencyBackend } from "../lib/idempotency";
import { computeSignupAmounts } from "../lib/billing-math";
import { advanceBillingDate, utcMidnight } from "../lib/billing-dates";
import type { BillingStore } from "../repositories/billing";
import { consumeRedemption, validateCoupon, CouponError } from "./coupons";
import { syncWalletMethods } from "./methods";
import { sendChargeReceipt, sendSubscriptionNotice } from "./mail";
import { BillingError } from "./errors";
import type { Gateway } from "./gateway";

export interface SignupInput {
  orgId: string;
  userId: string;
  planId: string;
  interval: "month" | "year";
  couponCode?: string | null;
  /** Browser payment tracker (required when the total exceeds zero). */
  tracker?: string | null;
  /** Client idempotency key (header). Falls back to a tracker-derived key. */
  idempotencyKey?: string | null;
  /** Email recipients for receipts (org admins + buyer). */
  recipientEmails: string[];
}

export interface SignupResult {
  subscriptionId: string;
  invoiceId: string;
  invoiceNumber: string;
  totalMinor: number;
  nextCharge: number;
}

/**
 * Confirm a plan signup after the browser payment (Atoms) completes.
 *
 * Trust chain: the payment session was created server-side with the exact
 * amount; confirm requires the stored session amount to equal the computed
 * total AND the tracker to report succeeded. A client can never underpay by
 * requesting a smaller session.
 *
 * Recovery: a "succeeded" session with an existing subscription returns the
 * existing result (crash between charge and confirm); a stray succeeded
 * session with no subscription is adopted.
 */
export async function confirmSignup(
  env: Env,
  store: BillingStore,
  idem: IdempotencyBackend,
  gateway: Gateway,
  input: SignupInput,
  now = nowSec(),
): Promise<{ cached: boolean; result: SignupResult }> {
  const plan = await store.getPlan(input.planId);
  if (!plan || plan.active !== 1) throw new BillingError("Plan is not available", 422);
  if (input.interval !== "month" && input.interval !== "year") {
    throw new BillingError("Interval must be month or year", 422);
  }
  if (plan.currency !== "USD") throw new BillingError("Only USD billing is supported", 422);

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
  const amounts = computeSignupAmounts({
    setupMinor: plan.setupFeeMinor,
    recurringMinor,
    coupon: couponTerms,
  });

  // Pre-checks outside the idempotent section (safe to repeat).
  const preexisting = await store.getOrgSubscription(input.orgId);
  if (preexisting && amounts.totalMinor > 0 && !input.tracker) {
    throw new BillingError("This organization already has a subscription", 409);
  }

  const key = input.idempotencyKey ?? `signup:${input.orgId}:${input.tracker ?? "free"}`;
  const hash = await requestHashFor({
    orgId: input.orgId,
    planId: plan.id,
    interval: input.interval,
    couponCode: input.couponCode ?? null,
    tracker: input.tracker ?? null,
    totalMinor: amounts.totalMinor,
  });

  return withIdem(idem, key, hash, "signup", async (): Promise<SignupResult> => {
    const existingSub = await store.getOrgSubscription(input.orgId);
    if (existingSub) {
      const prior = (await store.listInvoicesForOrg(input.orgId)).find(
        (i) => i.subscriptionId === existingSub.id,
      );
      if (prior) {
        return {
          subscriptionId: existingSub.id,
          invoiceId: prior.id,
          invoiceNumber: prior.number ?? prior.id,
          totalMinor: prior.amountMinor,
          nextCharge: existingSub.nextCharge,
        };
      }
      throw new BillingError("This organization already has a subscription", 409);
    }

    let tracker: string | null = null;
    let chargeId: string | null = null;

    if (amounts.totalMinor > 0) {
      if (!input.tracker) throw new BillingError("Payment is required", 402);
      const session = await store.getPaymentSession(input.tracker);
      if (!session || session.orgId !== input.orgId) {
        throw new BillingError("Payment session is invalid", 422);
      }
      if (session.amountMinor !== amounts.totalMinor || session.currency !== plan.currency) {
        throw new BillingError("Payment amount does not match the order total", 422);
      }
      if (session.status !== "pending" && session.status !== "succeeded") {
        throw new BillingError("Payment session is invalid or already used", 422);
      }
      const status = await gateway.checkTrackerStatus(input.tracker);
      if (status !== "succeeded") {
        throw new BillingError("Payment has not completed", 402);
      }
      tracker = input.tracker;
      chargeId = input.tracker;
      await store.markPaymentSession(input.tracker, "succeeded");
    }

    // Save the charged card(s) for renewals before creating the schedule.
    const { methods } = await syncWalletMethods(env, store, gateway, input.orgId, input.userId);
    const primary = methods.find((m) => m.isDefault === 1 && m.status === "active") ?? methods[0];
    if (amounts.totalMinor > 0 && !primary) {
      throw new BillingError("No saved payment method found after payment", 422);
    }

    const trialDays = plan.trialPeriodDays ?? 0;
    const firstBilling = utcMidnight(now) + trialDays * 86400;
    const nextCharge = advanceBillingDate(firstBilling, input.interval, 1);

    const subscriptionId = crypto.randomUUID();
    await store.insertSubscription({
      id: subscriptionId,
      orgId: input.orgId,
      planId: plan.id,
      interval: input.interval,
      intervalCount: 1,
      status: trialDays > 0 ? "trialing" : "active",
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

    const lines = [
      ...(amounts.setupMinor > 0
        ? [{ description: `Setup fee — ${plan.name}`, amountMinor: amounts.setupMinor }]
        : []),
      {
        description: `${plan.name} — ${input.interval === "month" ? "monthly" : "yearly"} (first period)`,
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
        description: `Signup — ${plan.name}`,
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
      description: `Signup — ${plan.name}`,
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
    });
    await sendSubscriptionNotice(env, store, input.recipientEmails, "active", plan.name);

    return {
      subscriptionId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number ?? invoice.id,
      totalMinor: amounts.totalMinor,
      nextCharge,
    };
  });
}
