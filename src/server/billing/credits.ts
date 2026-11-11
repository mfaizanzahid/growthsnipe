import { OFFERS, OFFER_CREDITS } from "../../lib/offers";
import { couponExpiryFromDays } from "../../lib/credit-coupon";
import { nowSec } from "../lib/time";
import type { BillingStore, CouponRow, OneTimeOrderRow } from "../repositories/billing";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface CreditCoupon {
  code: string;
  amountMinor: number;
  amountLabel: string;
  expiresAt: number | null;
  targetName: string;
  instructions: string;
}

/**
 * Issue the $199 Blueprint credit from a paid Diagnostic order. The coupon is
 * bound to the buyer email, restricted to the Blueprint checkout, and expires
 * 14 days after purchase. Idempotent by source order id.
 */
export async function issueDiagnosticCreditCoupon(
  store: BillingStore,
  order: OneTimeOrderRow,
  nowMs = Date.now(),
): Promise<CouponRow> {
  const existing = await store.getCouponBySourceOrderId(order.id);
  if (existing) return existing;
  return createCreditCoupon(store, {
    prefix: "DIAG",
    amountMinor: OFFERS.diagnostic.price.amountMinor,
    productSlug: OFFERS.blueprint.id,
    planIds: [],
    appliesToSetup: 0,
    restrictedEmail: order.email,
    sourceOrderId: order.id,
    createdBy: `credit:diagnostic:${order.id}`,
    validUntil: couponExpiryFromDays(
      order.paidAt ?? order.createdAt,
      OFFER_CREDITS.diagnosticToBlueprint.days,
    ),
    nowMs,
  });
}

/**
 * Safety net for a Diagnostic order whose coupon was not issued at purchase.
 * Old orders past their credit window are left without a coupon so reports do
 * not show an expired code that the buyer never received.
 */
export async function ensureDiagnosticCreditCoupon(
  store: BillingStore,
  order: OneTimeOrderRow,
  nowMs = Date.now(),
): Promise<CouponRow | null> {
  const existing = await store.getCouponBySourceOrderId(order.id);
  if (existing) return existing;
  const validUntil = couponExpiryFromDays(
    order.paidAt ?? order.createdAt,
    OFFER_CREDITS.diagnosticToBlueprint.days,
  );
  if (validUntil <= nowSec()) return null;
  return issueDiagnosticCreditCoupon(store, order, nowMs);
}

/**
 * Issue the $999 Engine setup credit from a paid Blueprint order. Engine plans
 * are contact-only today, so the code is presented as a sales credit that the
 * team applies during onboarding. Idempotent by source order id.
 */
export async function issueBlueprintCreditCoupon(
  store: BillingStore,
  order: OneTimeOrderRow,
  nowMs = Date.now(),
): Promise<CouponRow> {
  const existing = await store.getCouponBySourceOrderId(order.id);
  if (existing) return existing;
  return createCreditCoupon(store, {
    prefix: "BP",
    amountMinor: OFFERS.blueprint.price.amountMinor,
    productSlug: null,
    planIds: [OFFERS.engineCore.id, OFFERS.engineCommand.id],
    appliesToSetup: 1,
    restrictedEmail: order.email,
    sourceOrderId: order.id,
    createdBy: `credit:blueprint:${order.id}`,
    validUntil: couponExpiryFromDays(
      order.paidAt ?? order.createdAt,
      OFFER_CREDITS.blueprintToEngine.expiryDays,
    ),
    nowMs,
  });
}

export function creditForDiagnosticCoupon(coupon: CouponRow | null): CreditCoupon | null {
  if (!coupon || coupon.active !== 1) return null;
  return {
    code: coupon.code,
    amountMinor: coupon.amountOffMinor ?? OFFERS.diagnostic.price.amountMinor,
    amountLabel: OFFERS.diagnostic.price.label,
    expiresAt: coupon.validUntil,
    targetName: OFFERS.blueprint.name,
    instructions: "Use it at the Blueprint checkout.",
  };
}

export function creditForBlueprintCoupon(coupon: CouponRow | null): CreditCoupon | null {
  if (!coupon || coupon.active !== 1) return null;
  return {
    code: coupon.code,
    amountMinor: coupon.amountOffMinor ?? OFFERS.blueprint.price.amountMinor,
    amountLabel: OFFERS.blueprint.price.label,
    expiresAt: coupon.validUntil,
    targetName: "SNIPE Engine™",
    instructions: "Your GrowthSnipe contact will apply it when you start SNIPE Engine™.",
  };
}

interface CreateCreditCouponInput {
  prefix: string;
  amountMinor: number;
  productSlug: string | null;
  planIds: string[];
  appliesToSetup: number;
  restrictedEmail: string;
  sourceOrderId: string;
  createdBy: string;
  validUntil: number;
  nowMs: number;
}

async function createCreditCoupon(
  store: BillingStore,
  input: CreateCreditCouponInput,
): Promise<CouponRow> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = `${input.prefix}-${randomCode()}`;
    if (await store.getCouponByCode(code)) continue;
    try {
      const coupon = await store.insertCoupon({
        id: `cpn_${crypto.randomUUID().slice(0, 8)}`,
        code,
        kind: "fixed",
        percentOff: null,
        amountOffMinor: input.amountMinor,
        currency: "USD",
        duration: "once",
        durationCycles: null,
        appliesToSetup: input.appliesToSetup,
        maxRedemptions: 1,
        redeemedCount: 0,
        validFrom: Math.floor(input.nowMs / 1000),
        validUntil: input.validUntil,
        restrictedEmail: input.restrictedEmail.trim().toLowerCase(),
        oneTimeProductSlug: input.productSlug,
        sourceOrderId: input.sourceOrderId,
        active: 1,
        createdBy: input.createdBy,
      });
      if (input.planIds.length > 0) await store.setCouponPlans(coupon.id, input.planIds);
      return coupon;
    } catch (err) {
      const existing = await store.getCouponBySourceOrderId(input.sourceOrderId);
      if (existing) return existing;
      if (attempt === 5) throw err;
    }
  }
  throw new Error("Could not create a unique credit coupon code");
}

function randomCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}
