import type { BillingStore } from "../repositories/billing";
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
): Promise<ValidCoupon> {
  const coupon = await store.getCouponByCode(code);
  if (!coupon || coupon.active !== 1) throw new CouponError("Discount code is not valid", 404);
  if (coupon.validFrom !== null && now < coupon.validFrom) {
    throw new CouponError("Discount code is not active yet", 422);
  }
  if (coupon.validUntil !== null && now > coupon.validUntil) {
    throw new CouponError("Discount code has expired", 422);
  }
  if (coupon.maxRedemptions !== null && (coupon.redeemedCount ?? 0) >= coupon.maxRedemptions) {
    throw new CouponError("Discount code has reached its redemption limit", 422);
  }
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

/** Consume one redemption (called once per subscription attach). */
export async function consumeRedemption(store: BillingStore, couponId: string): Promise<void> {
  await store.bumpCouponRedemptions(couponId);
}
