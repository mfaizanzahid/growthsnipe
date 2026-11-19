import { OFFERS } from "../../lib/offers";
import type { Env } from "../types";
import type { Db } from "../repositories/db";
import { getSetting } from "../repositories";
import { PORTAL_NAME } from "../lib/brand";
import { sendEmail, subscribePurchaserToBrevo } from "../lib/email";
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
import { CouponError, validateOneTimeCoupon } from "./coupons";
import {
  creditForBlueprintCoupon,
  creditForDiagnosticCoupon,
  issueBlueprintCreditCoupon,
  issueDiagnosticCreditCoupon,
} from "./credits";
import { startBlueprintBaseline, startDiagnosticRun } from "../diagnostic/report";
import { ensureLoopsWelcome, sendLoopsDocumentEmail } from "../loops/document";
import { ensureOneTimeInvoice, sendOneTimeInvoiceEmail } from "./one-time-invoices";
import {
  createOneTimeOrder,
  drizzleStore,
  findOneTimeOrderByIdempotencyKey,
  findOneTimeOrderByTracker,
  getOneTimeOrder,
  getOneTimeProduct,
  getOneTimeProductBySlug,
  listOneTimeProducts,
  updateOneTimeOrder,
  type CouponRow,
  type OneTimeInvoiceRow,
  type OneTimeOrderRow,
  type OneTimeProductRow,
} from "../repositories/billing";

export const ONE_TIME_SLUGS = ["diagnostic", "blueprint", "loops"] as const;
export type OneTimeSlug = (typeof ONE_TIME_SLUGS)[number];

/**
 * Standing coupon applied to a product without the buyer entering a code.
 * Loops is $99 list, 100% off, so every order completes at $0.
 */
const AUTO_COUPON_BY_SLUG: Partial<Record<OneTimeSlug, string>> = {
  loops: OFFERS.loops.promoCode,
};

export function autoCouponCodeFor(slug: string): string | null {
  return AUTO_COUPON_BY_SLUG[slug as OneTimeSlug] ?? null;
}

export interface OneTimeSessionInput {
  slug: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  country: string;
  businessName?: string | null;
  trade?: string | null;
  website?: string | null;
  couponCode?: string | null;
  idempotencyKey?: string | null;
}

export interface OneTimeSessionResult {
  orderId: string;
  tracker: string;
  clientToken: string;
  environment: string;
  amountMinor: number;
  cached: boolean;
  /** True when the coupon covered the full price and no payment session was needed. */
  paid: boolean;
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
          paid: true,
        };
      }
      if (existing.amountMinor === 0) {
        await completeOneTimePaidOrder(db, env, existing.id, "free", now);
        const completed = await getOneTimeOrder(db, existing.id);
        if (!completed || completed.status !== "paid") {
          throw new Error("Free order could not be completed");
        }
        return {
          orderId: existing.id,
          tracker: existing.tracker ?? "",
          clientToken: "",
          environment: env.SAFEPAY_ENV ?? "sandbox",
          amountMinor: 0,
          cached: true,
          paid: true,
        };
      }
      const [tracker, clientToken] = await Promise.all([
        gateway.createPaymentSession({
          user: await gateway.createCustomer({
            firstName: input.firstName,
            lastName: input.lastName,
            email,
            phoneNumber: input.phone,
            country: input.country,
          }),
          merchantApiKey: env.SAFEPAY_PUBLIC_KEY,
          mode: "payment",
          currency: "USD",
          amountMinor: existing.amountMinor,
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
        paid: false,
      };
    }
  }

  const store = drizzleStore(db);
  const requestedCoupon = input.couponCode?.trim() || autoCouponCodeFor(product.slug) || "";
  let couponId: string | null = null;
  let couponCode: string | null = null;
  let discountMinor = 0;
  let amountMinor = product.amountMinor;
  if (requestedCoupon) {
    try {
      const valid = await validateOneTimeCoupon(
        store,
        requestedCoupon,
        product.slug,
        product.amountMinor,
        email,
        Math.floor(now / 1000),
      );
      couponId = valid.coupon.id;
      couponCode = valid.coupon.code;
      discountMinor = valid.discountMinor;
      amountMinor = valid.amountMinor;
    } catch (err) {
      if (err instanceof CouponError) throw new BillingError(err.message, err.status);
      throw err;
    }
  }

  const orderId = crypto.randomUUID();
  const key = input.idempotencyKey ?? `oto:${orderId}`;
  await createOneTimeOrder(db, {
    id: orderId,
    productId: product.id,
    email,
    name: `${input.firstName.trim()} ${input.lastName.trim()}`.trim(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone: input.phone,
    businessName: input.businessName ?? null,
    trade: input.trade ?? null,
    website: input.website ?? null,
    amountMinor,
    currency: "USD",
    tracker: null,
    idempotencyKey: key,
    couponId,
    couponCode,
    discountMinor,
    now,
  });
  if (amountMinor === 0) {
    await completeOneTimePaidOrder(db, env, orderId, "free", now);
    const completed = await getOneTimeOrder(db, orderId);
    if (!completed || completed.status !== "paid") {
      throw new Error("Free order could not be completed");
    }
    return {
      orderId,
      tracker: "",
      clientToken: "",
      environment: env.SAFEPAY_ENV ?? "sandbox",
      amountMinor: 0,
      cached: false,
      paid: true,
    };
  }

  const [tracker, clientToken] = await Promise.all([
    gateway.createPaymentSession({
      user: await gateway.createCustomer({
        firstName: input.firstName,
        lastName: input.lastName,
        email,
        phoneNumber: input.phone,
        country: input.country,
      }),
      merchantApiKey: env.SAFEPAY_PUBLIC_KEY,
      mode: "payment",
      currency: "USD",
      amountMinor,
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
    amountMinor,
    cached: false,
    paid: false,
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
  const discountMinor = order.discountMinor ?? 0;
  const expectedMinor = product.amountMinor - discountMinor;
  if (
    discountMinor < 0 ||
    discountMinor >= product.amountMinor ||
    order.amountMinor !== expectedMinor ||
    order.currency !== "USD" ||
    product.currency !== "USD"
  ) {
    throw new BillingError("Order amount does not match the expected total", 422);
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
  const store = drizzleStore(db);

  if (order.couponId && !order.couponRedeemedAt) {
    const consumed = await store.bumpCouponRedemptionsIfAvailable(order.couponId);
    if (!consumed) {
      console.error("[one-time] coupon could not be redeemed:", order.couponId);
    }
  }

  let creditCoupon: CouponRow | null = null;
  try {
    const paidOrder = { ...order, paidAt: now };
    creditCoupon =
      product.slug === "diagnostic"
        ? await issueDiagnosticCreditCoupon(store, paidOrder, now)
        : product.slug === "blueprint"
          ? await issueBlueprintCreditCoupon(store, paidOrder, now)
          : null;
  } catch (err) {
    console.error("[one-time] could not issue credit coupon:", (err as Error)?.message ?? err);
  }

  await updateOneTimeOrder(db, order.id, {
    status: "paid",
    chargeId,
    paidAt: now,
    updatedAt: now,
    ...(order.couponId && !order.couponRedeemedAt ? { couponRedeemedAt: now } : {}),
  });
  const fresh = (await getOneTimeOrder(db, order.id)) ?? order;

  // Every paid buyer joins the Brevo new signup list. Best-effort: the paid
  // order, invoice and delivery emails never depend on Brevo.
  const subscribed = await subscribePurchaserToBrevo(env, {
    email: fresh.email,
    name: fresh.name,
  });
  if (subscribed === "failed") {
    console.warn("[one-time] could not add buyer to the Brevo signup list:", order.id);
  }

  let invoice: OneTimeInvoiceRow | null = null;
  try {
    invoice = await ensureOneTimeInvoice(db, fresh, product, now);
  } catch (err) {
    console.error("[one-time] could not create invoice:", (err as Error)?.message ?? err);
  }

  if (!fresh.receiptSentAt) {
    const sendIntake = product.slug === "diagnostic";
    try {
      await sendOneTimeEmails(db, env, fresh, product, invoice, creditCoupon, sendIntake, now);
      await updateOneTimeOrder(db, order.id, {
        receiptSentAt: now,
        ...(sendIntake ? { intakeSentAt: now } : {}),
        updatedAt: now,
      });
    } catch (err) {
      // The paid order stands even if the invoice/intake email cannot be sent now.
      console.error("[one-time] could not send purchase email:", (err as Error)?.message ?? err);
    }
  }
  if (product.slug === "loops") {
    try {
      await ensureLoopsWelcome(db, fresh, now);
    } catch (err) {
      // Marketing scheduling must never affect a paid order.
      console.error("[loops] could not schedule welcome sequence:", (err as Error)?.message ?? err);
    }
  } else if (product.slug === "blueprint") {
    try {
      await startBlueprintBaseline(db, env, fresh, now);
    } catch (err) {
      // The paid order stands even if the baseline email cannot be sent now.
      console.error("[blueprint] could not start baseline:", (err as Error)?.message ?? err);
    }
  } else if (product.slug === "diagnostic") {
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

  // Every one-time buyer receives the SNIPE Loops playbook as a bonus,
  // rendered for the trade stored on the order. Sent last so the core
  // purchase and next-step emails land first.
  try {
    await sendLoopsDocumentEmail(db, env, fresh, false, now);
  } catch (err) {
    // The paid order stands even if the playbook email cannot be sent now.
    console.error("[one-time] could not send Loops playbook email:", (err as Error)?.message ?? err);
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
  product: OneTimeProductRow,
  invoice: OneTimeInvoiceRow | null,
  creditCoupon: CouponRow | null,
  sendIntake: boolean,
  now: number,
): Promise<void> {
  const support = (await getSetting(db, "support_email").catch(() => null)) ?? "";
  const credit =
    product.slug === "blueprint"
      ? creditForBlueprintCoupon(creditCoupon)
      : creditForDiagnosticCoupon(creditCoupon);
  const base = env.APP_BASE_URL ?? "";
  const billingUrl = `${base}/`;
  const from = env.RESEND_FROM_EMAIL;

  if (invoice) {
    await sendOneTimeInvoiceEmail(db, env, order, invoice, product, credit, false, now);
  } else {
    const receipt = oneTimeReceiptContent({
      productName: product.name,
      amountMinor: order.amountMinor,
      currency: order.currency,
      orderRef: order.id.slice(0, 8).toUpperCase(),
      discountMinor: order.discountMinor,
      couponCode: order.couponCode,
      credit,
    });
    await sendEmail(
      env,
      {
        to: order.email,
        subject: `[${PORTAL_NAME}] ${receipt.subject}`,
        html: layout(PORTAL_NAME, support, billingUrl, receipt.subject, receipt.html + `<p style="font-size:12px;color:#666">${money(order.amountMinor, order.currency)} · ${escapeHtml(product.name)}</p>`),
      },
      from,
    );
  }

  if (sendIntake) {
    const intake = oneTimeIntakeContent({
      productSlug: "diagnostic",
      firstName: firstNameOf(order.name),
      credit,
      blueprintUrl: `${base}/blueprint`,
      bookUrl: `${base}/book`,
    });
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
}

export async function listProducts(db: Db) {
  return listOneTimeProducts(db);
}

export { findOneTimeOrderByTracker };
