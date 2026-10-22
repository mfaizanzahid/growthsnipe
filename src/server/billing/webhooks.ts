import type { Env } from "../types";
import { nowSec } from "../lib/time";
import { sha256Hex } from "../lib/crypto";
import { verifySafepaySignature } from "../providers/safepay";
import type { BillingStore } from "../repositories/billing";
import {
  sendChargeReceipt,
  sendDunningReminder,
  sendPaymentFailed,
  sendRefundNotice,
  sendSubscriptionNotice,
} from "./mail";

export interface WebhookOutcome {
  httpStatus: 200 | 401;
  ack: "ok" | "duplicate" | "ignored" | "reconciled" | "unauthorized" | "unparseable";
}

interface Envelope {
  token?: unknown;
  type?: unknown;
  data?: Record<string, unknown>;
}

/**
 * Safepay webhook handler (async safety net; the synchronous charge paths
 * remain authoritative for the happy path).
 *
 * - Verifies `X-SFPY-SIGNATURE` (HMAC-SHA512 hex of the RAW body) first.
 * - Dedupes on the envelope token (`evt_…`).
 * - Reconciles conservatively: transitions only due→paid, due→failed, and
 *   records refunds. NEVER downgrades paid/refunded/void invoices.
 * - Unknown event types are acknowledged and ignored (we use no native
 *   subscriptions, so subscription.* events carry nothing for us).
 */
export async function handleSafepayWebhook(
  env: Env,
  store: BillingStore,
  rawBody: string,
  signature: string | null,
  now = nowSec(),
): Promise<WebhookOutcome> {
  const verified = await verifySafepaySignature(rawBody, signature, env.SAFEPAY_WEBHOOK_SECRET);
  if (!verified) return { httpStatus: 401, ack: "unauthorized" };

  let envelope: Envelope;
  try {
    envelope = JSON.parse(rawBody) as Envelope;
  } catch {
    return { httpStatus: 200, ack: "unparseable" };
  }
  const token = typeof envelope.token === "string" ? envelope.token : null;
  const type = typeof envelope.type === "string" ? envelope.type : null;
  if (!token || !type) return { httpStatus: 200, ack: "unparseable" };

  const payloadHash = await sha256Hex(new TextEncoder().encode(rawBody));
  const first = await store.recordWebhookEvent({
    source: "safepay",
    externalId: token,
    eventType: type,
    payloadHash,
    payloadJsonRedacted: JSON.stringify(redact(envelope)),
  });
  if (!first) return { httpStatus: 200, ack: "duplicate" };

  const data = envelope.data && typeof envelope.data === "object" ? envelope.data : {};
  switch (type) {
    case "payment.succeeded":
      await reconcileSucceeded(env, store, data, now);
      return { httpStatus: 200, ack: "reconciled" };
    case "payment.failed":
      await reconcileFailed(env, store, data, now);
      return { httpStatus: 200, ack: "reconciled" };
    case "payment.refunded":
      await reconcileRefunded(env, store, data);
      return { httpStatus: 200, ack: "reconciled" };
    default:
      return { httpStatus: 200, ack: "ignored" };
  }
}

function redact(envelope: Envelope): unknown {
  const data = { ...(envelope.data ?? {}) };
  for (const key of ["customer_email", "email", "merchant_api_key"]) {
    if (key in data) data[key] = "[redacted]";
  }
  return { token: envelope.token, type: envelope.type, data };
}

function trackerOf(data: Record<string, unknown>): string | null {
  return typeof data.tracker === "string" ? data.tracker : null;
}

async function reconcileSucceeded(
  env: Env,
  store: BillingStore,
  data: Record<string, unknown>,
  now: number,
): Promise<void> {
  const tracker = trackerOf(data);
  if (!tracker) return;
  const invoice = await store.findInvoiceByTracker(tracker);
  if (!invoice) return;
  if (invoice.status !== "due" && invoice.status !== "failed") return;
  await store.insertTransaction({
    orgId: invoice.orgId,
    invoiceId: invoice.id,
    tracker,
    chargeId: typeof data.charge === "string" ? data.charge : (invoice.chargeId ?? tracker),
    kind: "webhook_confirm",
    status: "succeeded",
    amountMinor: invoice.amountMinor,
    currency: invoice.currency,
    description: "Late payment confirmation via webhook",
  });
  await store.updateInvoice(invoice.id, { status: "paid", paidAt: now });
  const recipients = await store.listOrgAdminEmails(invoice.orgId);
  await sendChargeReceipt(env, store, recipients, {
    invoiceNumber: invoice.number ?? invoice.id,
    amountMinor: invoice.amountMinor,
    currency: invoice.currency,
    planName: "Subscription",
  });
  if (invoice.subscriptionId) {
    const sub = await store.getSubscription(invoice.subscriptionId);
    if (sub && sub.status === "past_due") {
      await store.updateSubscription(sub.id, {
        status: "active",
        pastDueSince: null,
        currency: sub.currency,
        recurringAmountMinor: sub.recurringAmountMinor,
      });
      await sendSubscriptionNotice(env, store, recipients, "active", "Subscription");
    }
  }
}

async function reconcileFailed(
  env: Env,
  store: BillingStore,
  data: Record<string, unknown>,
  now: number,
): Promise<void> {
  const tracker = trackerOf(data);
  if (!tracker) return;
  const invoice = await store.findInvoiceByTracker(tracker);
  if (!invoice || invoice.status !== "due") return;
  await store.updateInvoice(invoice.id, { status: "failed", reminderCount: 1, lastReminderAt: now });
  await store.insertTransaction({
    orgId: invoice.orgId,
    invoiceId: invoice.id,
    tracker,
    kind: "webhook_confirm",
    status: "failed",
    amountMinor: invoice.amountMinor,
    currency: invoice.currency,
    description: "Late payment failure via webhook",
  });
  const recipients = await store.listOrgAdminEmails(invoice.orgId);
  await sendPaymentFailed(env, store, recipients, {
    invoiceNumber: invoice.number ?? invoice.id,
    amountMinor: invoice.amountMinor,
    currency: invoice.currency,
    attempt: "payment failed",
  });
  if (invoice.subscriptionId) {
    const sub = await store.getSubscription(invoice.subscriptionId);
    // A trial (plain or prepaid) has no renewal charge to fail: its first
    // paid period starts when the trial ends, so a late failure notice must
    // not suspend a workspace that is still inside its trial.
    if (sub && sub.status !== "past_due" && sub.status !== "canceled" && sub.status !== "trialing") {
      await store.updateSubscription(sub.id, {
        status: "past_due",
        pastDueSince: sub.pastDueSince ?? now,
        currency: sub.currency,
        recurringAmountMinor: sub.recurringAmountMinor,
      });
      await sendSubscriptionNotice(env, store, recipients, "past_due", "Subscription");
      await sendDunningReminder(env, store, recipients, {
        invoiceNumber: invoice.number ?? invoice.id,
        amountMinor: invoice.amountMinor,
        currency: invoice.currency,
        final: false,
      });
    }
  }
}

async function reconcileRefunded(
  env: Env,
  store: BillingStore,
  data: Record<string, unknown>,
): Promise<void> {
  const tracker = trackerOf(data);
  if (!tracker) return;
  const invoice = await store.findInvoiceByTracker(tracker);
  if (!invoice || invoice.status === "void") return;
  const refundMinor =
    typeof data.refund_amount === "number" ? Math.floor(data.refund_amount) : null;
  if (refundMinor === null || refundMinor <= 0) return;
  const existing = (await store.listTransactionsByTracker(tracker)).filter(
    (t) => t.kind === "refund" && t.amountMinor === -refundMinor,
  );
  if (existing.length > 0) return;
  await store.insertTransaction({
    orgId: invoice.orgId,
    invoiceId: invoice.id,
    tracker,
    kind: "refund",
    status: "succeeded",
    amountMinor: -refundMinor,
    currency: typeof data.currency === "string" ? data.currency : invoice.currency,
    description: `Refund via webhook — ${invoice.number ?? invoice.id}`,
  });
  const priorRefunds = (await store.listTransactionsByTracker(tracker))
    .filter((t) => t.kind === "refund")
    .reduce((sum, t) => sum + Math.abs(t.amountMinor), 0);
  const full = priorRefunds >= invoice.amountMinor;
  if (full && invoice.status === "paid") {
    await store.updateInvoice(invoice.id, { status: "refunded" });
  }
  await sendRefundNotice(env, store, await store.listOrgAdminEmails(invoice.orgId), {
    invoiceNumber: invoice.number ?? invoice.id,
    amountMinor: refundMinor,
    currency: invoice.currency,
    full,
  });
}
