import type { Env } from "../types";
import type { Db } from "../repositories/db";
import { getSetting } from "../repositories";
import { PORTAL_NAME } from "../lib/brand";
import { sendEmail } from "../lib/email";
import {
  escapeHtml,
  firstNameOf,
  layout,
  money,
  oneTimeIntakeContent,
  oneTimeReceiptContent,
} from "../email/templates";
import { BillingError } from "./errors";
import type { Gateway } from "./gateway";
import { startDiagnosticRun } from "../diagnostic/report";
import {
  createOneTimeOrder,
  findOneTimeOrderByIdempotencyKey,
  findOneTimeOrderByTracker,
  getOneTimeOrder,
  getOneTimeProduct,
  getOneTimeProductBySlug,
  listOneTimeProducts,
  updateOneTimeOrder,
  type OneTimeOrderRow,
} from "../repositories/billing";

export const ONE_TIME_SLUGS = ["diagnostic", "blueprint"] as const;
export type OneTimeSlug = (typeof ONE_TIME_SLUGS)[number];

export interface OneTimeSessionInput {
  slug: string;
  email: string;
  name?: string | null;
  phone: string;
  country: string;
  businessName?: string | null;
  trade?: string | null;
  idempotencyKey?: string | null;
}

export interface OneTimeSessionResult {
  orderId: string;
  tracker: string;
  clientToken: string;
  environment: string;
  amountMinor: number;
  cached: boolean;
}

/**
 * Create a Safepay payment session for a one-time product. The amount is
 * always server-computed from the product row — the client never sets it.
 * Guests are welcome: no org, no saved card, no `pm_` token is persisted.
 */
export async function createOneTimeSession(
  db: Db,
  env: Env,
  gateway: Gateway,
  input: OneTimeSessionInput,
  now = Date.now(),
): Promise<OneTimeSessionResult> {
  const product = await getOneTimeProductBySlug(db, input.slug);
  if (!product || product.active !== 1) throw new BillingError("Product is not available", 422);
  if (product.currency !== "USD") throw new BillingError("Only USD billing is supported", 422);

  const email = input.email.trim().toLowerCase();
  if (input.idempotencyKey) {
    const existing = await findOneTimeOrderByIdempotencyKey(db, input.idempotencyKey);
    if (existing) {
      if (existing.status === "paid") {
        return {
          orderId: existing.id,
          tracker: existing.tracker ?? "",
          clientToken: "",
          environment: env.SAFEPAY_ENV ?? "sandbox",
          amountMinor: existing.amountMinor,
          cached: true,
        };
      }
      const [tracker, clientToken] = await Promise.all([
        gateway.createPaymentSession({
          user: await gateway.createCustomer({
            firstName: input.name?.trim() || undefined,
            email,
            phoneNumber: input.phone,
            country: input.country,
          }),
          merchantApiKey: env.SAFEPAY_PUBLIC_KEY,
          mode: "payment",
          currency: "USD",
          amountMinor: product.amountMinor,
          entryMode: "raw",
        }),
        gateway.createClientAuthToken(),
      ]);
      await updateOneTimeOrder(db, existing.id, { tracker, updatedAt: now });
      return {
        orderId: existing.id,
        tracker,
        clientToken,
        environment: env.SAFEPAY_ENV ?? "sandbox",
        amountMinor: existing.amountMinor,
        cached: true,
      };
    }
  }

  const orderId = crypto.randomUUID();
  const key = input.idempotencyKey ?? `oto:${orderId}`;
  await createOneTimeOrder(db, {
    id: orderId,
    productId: product.id,
    email,
    name: input.name ?? null,
    phone: input.phone,
    businessName: input.businessName ?? null,
    trade: input.trade ?? null,
    amountMinor: product.amountMinor,
    currency: "USD",
    tracker: null,
    idempotencyKey: key,
    now,
  });
  const [tracker, clientToken] = await Promise.all([
    gateway.createPaymentSession({
      user: await gateway.createCustomer({
        firstName: input.name?.trim() || undefined,
        email,
        phoneNumber: input.phone,
        country: input.country,
      }),
      merchantApiKey: env.SAFEPAY_PUBLIC_KEY,
      mode: "payment",
      currency: "USD",
      amountMinor: product.amountMinor,
      entryMode: "raw",
    }),
    gateway.createClientAuthToken(),
  ]);
  await updateOneTimeOrder(db, orderId, { tracker, updatedAt: now });
  return {
    orderId,
    tracker,
    clientToken,
    environment: env.SAFEPAY_ENV ?? "sandbox",
    amountMinor: product.amountMinor,
    cached: false,
  };
}

export interface OneTimeConfirmResult {
  orderId: string;
  productSlug: string;
  amountMinor: number;
  cached: boolean;
}

/**
 * Confirm a one-time order after the browser payment completes.
 *
 * Trust chain mirrors signup: the amount must equal the product price AND the
 * tracker must report succeeded. Confirming an already-paid order returns the
 * existing result (crash between charge and confirm is safe).
 */
export async function confirmOneTimeOrder(
  db: Db,
  env: Env,
  gateway: Gateway,
  input: { orderId: string; tracker: string },
  now = Date.now(),
): Promise<OneTimeConfirmResult> {
  const order = await getOneTimeOrder(db, input.orderId);
  if (!order) throw new BillingError("Order not found", 404);
  if (order.status === "paid") {
    return { orderId: order.id, productSlug: await slugOf(db, order), amountMinor: order.amountMinor, cached: true };
  }
  if (order.status !== "pending") throw new BillingError("Order cannot be confirmed", 409);
  if (!order.tracker || order.tracker !== input.tracker) {
    throw new BillingError("Payment session does not match this order", 422);
  }
  const product = await getOneTimeProduct(db, order.productId);
  if (!product || product.active !== 1) throw new BillingError("Product is not available", 422);
  if (order.amountMinor !== product.amountMinor || order.currency !== "USD" || product.currency !== "USD") {
    throw new BillingError("Order amount does not match the product price", 422);
  }
  const status = await gateway.checkTrackerStatus(input.tracker);
  if (status === "pending") throw new BillingError("Payment has not completed yet", 402);
  if (status !== "succeeded") {
    await updateOneTimeOrder(db, order.id, { status: "failed", updatedAt: now });
    throw new BillingError("Payment failed — please try again", 402);
  }
  await completeOneTimePaidOrder(db, env, order.id, input.tracker, now);
  return { orderId: order.id, productSlug: product.slug, amountMinor: order.amountMinor, cached: false };
}

async function slugOf(db: Db, order: OneTimeOrderRow): Promise<string> {
  const product = await getOneTimeProduct(db, order.productId);
  return product?.slug ?? "diagnostic";
}

/**
 * Flip a pending order to paid and send receipt + intake exactly once.
 * Shared by the confirm route and the webhook reconciler.
 */
export async function completeOneTimePaidOrder(
  db: Db,
  env: Env,
  orderId: string,
  chargeId: string,
  now = Date.now(),
): Promise<{ transitioned: boolean; order: OneTimeOrderRow | null }> {
  const order = await getOneTimeOrder(db, orderId);
  if (!order || order.status === "paid") return { transitioned: false, order };
  if (order.status !== "pending") return { transitioned: false, order };
  const product = await getOneTimeProduct(db, order.productId);
  if (!product) return { transitioned: false, order };
  await updateOneTimeOrder(db, order.id, { status: "paid", chargeId, paidAt: now, updatedAt: now });
  const fresh = (await getOneTimeOrder(db, order.id)) ?? order;
  if (!fresh.receiptSentAt) {
    await sendOneTimeEmails(db, env, fresh, product.name, product.slug as OneTimeSlug);
    await updateOneTimeOrder(db, order.id, { receiptSentAt: now, intakeSentAt: now, updatedAt: now });
  }
  if (product.slug === "diagnostic") {
    try {
      await startDiagnosticRun(db, env, {
        id: fresh.id,
        email: fresh.email,
        name: fresh.name,
        businessName: fresh.businessName,
        trade: fresh.trade,
      }, now);
    } catch (err) {
      // The paid order stands even if the connect email cannot be sent now.
      console.error("[diagnostic] could not start run:", (err as Error)?.message ?? err);
    }
  }
  return { transitioned: true, order: (await getOneTimeOrder(db, order.id)) ?? fresh };
}

export async function failOneTimeOrder(db: Db, orderId: string, now = Date.now()): Promise<boolean> {
  const order = await getOneTimeOrder(db, orderId);
  if (!order || order.status !== "pending") return false;
  await updateOneTimeOrder(db, order.id, { status: "failed", updatedAt: now });
  return true;
}

async function sendOneTimeEmails(
  db: Db,
  env: Env,
  order: OneTimeOrderRow,
  productName: string,
  slug: OneTimeSlug,
): Promise<void> {
  const support = (await getSetting(db, "support_email").catch(() => null)) ?? "";
  const receipt = oneTimeReceiptContent({
    productName,
    amountMinor: order.amountMinor,
    currency: order.currency,
    orderRef: order.id.slice(0, 8).toUpperCase(),
  });
  const intake = oneTimeIntakeContent({ productSlug: slug === "blueprint" ? "blueprint" : "diagnostic", firstName: firstNameOf(order.name) });
  const billingUrl = `${env.APP_BASE_URL ?? ""}/`;
  const from = env.RESEND_FROM_EMAIL;
  await sendEmail(
    env,
    {
      to: order.email,
      subject: `[${PORTAL_NAME}] ${receipt.subject}`,
      html: layout(PORTAL_NAME, support, billingUrl, receipt.subject, receipt.html + `<p style="font-size:12px;color:#666">${money(order.amountMinor, order.currency)} · ${escapeHtml(productName)}</p>`),
    },
    from,
  );
  await sendEmail(
    env,
    {
      to: order.email,
      subject: `[${PORTAL_NAME}] ${intake.subject}`,
      html: layout(PORTAL_NAME, support, billingUrl, intake.subject, intake.html),
    },
    from,
  );
}

export async function listProducts(db: Db) {
  return listOneTimeProducts(db);
}

export { findOneTimeOrderByTracker };
