import type { BillingStore, CouponRow } from "../repositories/billing";
import { nowSec } from "../lib/time";
import type { CouponTerms } from "../lib/billing-math";

export class CouponError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 422 = 400,
  ) {
    super(message);
    this.name = "CouponError";
  }
}

export interface ValidCoupon {
  coupon: {
    id: string;
    kind: string;
    percentOff: number | null;
    amountOffMinor: number | null;
    appliesToSetup: number | null;
    active: number | null;
    validFrom: number | null;
    validUntil: number | null;
    maxRedemptions: number | null;
    redeemedCount: number | null;
  };
  terms: CouponTerms;
}

/** Validate a coupon code for a plan (no side effects). */
export async function validateCoupon(
  store: BillingStore,
  code: string,
  planId: string,
  now = nowSec(),
  email?: string | null,
): Promise<ValidCoupon> {
  const coupon = await store.getCouponByCode(code);
  if (!coupon || coupon.active !== 1) throw new CouponError("Discount code is not valid", 404);
  if (coupon.oneTimeProductSlug) {
    throw new CouponError("This code is for a one-time purchase", 422);
  }
  assertCouponWindow(coupon, now);
  assertCouponEmail(coupon, email);
  const applicable = await store.listCouponPlans(coupon.id);
  if (applicable.length > 0 && !applicable.includes(planId)) {
    throw new CouponError("Discount code does not apply to this plan", 422);
  }
  if (coupon.kind !== "percent" && coupon.kind !== "fixed") {
    throw new CouponError("Discount code is misconfigured", 422);
  }
  return {
    coupon,
    terms: {
      kind: coupon.kind,
      percentOff: coupon.percentOff,
      amountOffMinor: coupon.amountOffMinor,
      appliesToSetup: coupon.appliesToSetup,
    },
  };
}

export interface OneTimeCouponTerms {
  coupon: CouponRow;
  discountMinor: number;
  amountMinor: number;
}

/**
 * Validate a coupon for a one-time product. Generic superadmin coupons apply
 * to any one-time product; credit coupons can target a specific product slug.
 */
export async function validateOneTimeCoupon(
  store: BillingStore,
  code: string,
  productSlug: string,
  productAmountMinor: number,
  email: string,
  now = nowSec(),
): Promise<OneTimeCouponTerms> {
  const coupon = await store.getCouponByCode(code);
  if (!coupon || coupon.active !== 1) throw new CouponError("Discount code is not valid", 404);
  if (coupon.oneTimeProductSlug && coupon.oneTimeProductSlug !== productSlug) {
    throw new CouponError("Discount code does not apply to this purchase", 422);
  }
  if (!coupon.oneTimeProductSlug && coupon.appliesToSetup === 1) {
    throw new CouponError(
      "This code applies to subscription setup, not one-time purchases",
      422,
    );
  }
  assertCouponWindow(coupon, now);
  assertCouponEmail(coupon, email);
  if (coupon.kind !== "percent" && coupon.kind !== "fixed") {
    throw new CouponError("Discount code is misconfigured", 422);
  }
  const computed =
    coupon.kind === "percent"
      ? Math.round((productAmountMinor * (coupon.percentOff ?? 0)) / 100)
      : coupon.amountOffMinor ?? 0;
  const discountMinor = Math.min(Math.max(0, computed), productAmountMinor);
  if (discountMinor <= 0) {
    throw new CouponError("Discount code has no value for this purchase", 422);
  }
  const amountMinor = productAmountMinor - discountMinor;
  return { coupon, discountMinor, amountMinor };
}

function assertCouponWindow(coupon: CouponRow, now: number): void {
  if (coupon.validFrom !== null && now < coupon.validFrom) {
    throw new CouponError("Discount code is not active yet", 422);
  }
  if (coupon.validUntil !== null && now > coupon.validUntil) {
    throw new CouponError("Discount code has expired", 422);
  }
  if (coupon.maxRedemptions !== null && (coupon.redeemedCount ?? 0) >= coupon.maxRedemptions) {
    throw new CouponError("Discount code has reached its redemption limit", 422);
  }
}

function assertCouponEmail(coupon: CouponRow, email?: string | null): void {
  if (!coupon.restrictedEmail || !email) return;
  if (coupon.restrictedEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
    throw new CouponError("Discount code is not valid for this email address", 422);
  }
}

/** Consume one redemption (called once per subscription attach). */
export async function consumeRedemption(store: BillingStore, couponId: string): Promise<void> {
  await store.bumpCouponRedemptions(couponId);
}
