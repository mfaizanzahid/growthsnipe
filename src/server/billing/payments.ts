import type { Env } from "../types";
import { nowSec } from "../lib/time";
import { withIdem, requestHashFor, DuplicateIdempotencyError, type IdempotencyBackend } from "../lib/idempotency";
import type { BillingStore } from "../repositories/billing";
import { decryptCustomerToken } from "./customers";
import { resolveMethodToken } from "./methods";
import { sendChargeReceipt, sendSubscriptionNotice } from "./mail";
import { BillingError } from "./errors";
import type { Gateway } from "./gateway";

/** Cooldown between manual attempts on the same invoice (seconds). */
const RETRY_COOLDOWN_SEC = 300;

export interface PayInput {
  orgId: string;
  invoiceId: string;
  /** Charge only this method; defaults to the org's primary valid method. */
  paymentMethodId?: string | null;
  idempotencyKey?: string | null;
  recipientEmails: string[];
  /** Superadmin actor email for the audit trail (appended to transaction notes). */
  actorEmail?: string | null;
}

/**
 * Pay a due/failed invoice with a SINGLE method (customer pay + admin retry).
 * Idempotent per key; repeats within the cooldown window get 429.
 * On success of a past-due subscription's invoice, the subscription recovers
 * to active (the schedule itself is untouched — the Cron collects the next
 * period on its normal date).
 */
export async function payInvoice(
  env: Env,
  store: BillingStore,
  idem: IdempotencyBackend,
  gateway: Gateway,
  input: PayInput,
  now = nowSec(),
): Promise<{ cached: boolean; result: { invoiceId: string; chargeId: string } }> {
  const invoice = await store.getInvoice(input.invoiceId);
  if (!invoice || invoice.orgId !== input.orgId) {
    throw new BillingError("Invoice not found", 404);
  }
  if (invoice.status === "paid" || invoice.status === "void") {
    throw new BillingError(`Invoice is already ${invoice.status}`, 409);
  }

  const methods = await store.listPaymentMethods(input.orgId);
  // Manual pay is an explicit user/superadmin action, so it may target any
  // saved card — including one marked failed (the overdue "Retry with primary
  // card" button depends on this). A declined retry re-marks it failed.
  const method = input.paymentMethodId
    ? (methods.find((m) => m.id === input.paymentMethodId) ?? null)
    : (methods.find((m) => m.isDefault === 1) ??
      methods.find((m) => m.status === "active") ??
      methods[0] ??
      null);
  if (!method) {
    throw new BillingError("Payment method not found", 404);
  }

  const last = await store.latestTransactionFor(invoice.id);
  if (last && now - Math.floor(last.createdAt / 1000) < RETRY_COOLDOWN_SEC) {
    throw new BillingError("Retry cooldown — please wait a few minutes", 429);
  }

  const window = Math.floor(now / RETRY_COOLDOWN_SEC);
  const key = input.idempotencyKey ?? `pay:${invoice.id}:${method.id}:${window}`;
  const hash = await requestHashFor({
    invoiceId: invoice.id,
    methodId: method.id,
    amount: invoice.amountMinor,
  });
  const actorNote = input.actorEmail ? ` — by ${input.actorEmail} (superadmin)` : "";

  try {
    return await withIdem(idem, key, hash, "pay-invoice", async () => {
      const customerToken = await decryptCustomerToken(env, store, input.orgId);
      if (!customerToken) throw new BillingError("No Safepay customer for this organization", 422);
      const methodToken = await resolveMethodToken(env, method);
      let charge: { tracker: string; chargeId: string };
      try {
        charge = await gateway.chargeSavedCard({
          customerToken,
          merchantApiKey: env.SAFEPAY_PUBLIC_KEY,
          paymentMethodToken: methodToken,
          currency: invoice.currency,
          amountMinor: invoice.amountMinor,
        });
      } catch {
        await store.updatePaymentMethod(method.id, { status: "failed" });
        await store.insertTransaction({
          orgId: input.orgId,
          invoiceId: invoice.id,
          paymentMethodId: method.id,
          kind: "manual_pay",
          status: "failed",
          amountMinor: invoice.amountMinor,
          currency: invoice.currency,
          description: `Manual invoice payment attempt${actorNote}`,
        });
        throw new BillingError("Card charge failed", 402);
      }

      await store.insertTransaction({
        orgId: input.orgId,
        invoiceId: invoice.id,
        paymentMethodId: method.id,
        tracker: charge.tracker,
        chargeId: charge.chargeId,
        kind: "manual_pay",
        status: "succeeded",
        amountMinor: invoice.amountMinor,
        currency: invoice.currency,
        description: `Manual invoice payment${actorNote}`,
      });
      await store.updateInvoice(invoice.id, {
        status: "paid",
        tracker: charge.tracker,
        chargeId: charge.chargeId,
        paidAt: now,
      });
      await store.updatePaymentMethod(method.id, { status: "active" });

      let recovered = false;
      if (invoice.subscriptionId) {
        const sub = await store.getSubscription(invoice.subscriptionId);
        if (sub && sub.status === "past_due") {
          await store.updateSubscription(sub.id, {
            status: "active",
            pastDueSince: null,
            currency: sub.currency,
            recurringAmountMinor: sub.recurringAmountMinor,
          });
          recovered = true;
        }
      }

      const planName = "Subscription";
      await sendChargeReceipt(env, store, input.recipientEmails, {
        invoiceNumber: invoice.number ?? invoice.id,
        amountMinor: invoice.amountMinor,
        currency: invoice.currency,
        planName,
      });
      if (recovered) {
        await sendSubscriptionNotice(env, store, input.recipientEmails, "active", planName);
      }
      return { invoiceId: invoice.id, chargeId: charge.chargeId };
    });
  } catch (err) {
    if (err instanceof DuplicateIdempotencyError) {
      throw new BillingError("Duplicate request — already processing", 429);
    }
    throw err;
  }
}
