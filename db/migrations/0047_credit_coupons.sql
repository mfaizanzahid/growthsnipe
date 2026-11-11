-- Personalized credit coupons issued from one-time purchases.
--
-- A Diagnostic purchase issues a $199 Blueprint coupon. A Blueprint purchase
-- issues a $999 Engine setup coupon. Coupons are email-bound, single-use, and
-- expire at a fixed date. source_order_id makes issuance idempotent.

ALTER TABLE coupons ADD COLUMN restricted_email TEXT;
ALTER TABLE coupons ADD COLUMN one_time_product_slug TEXT;
ALTER TABLE coupons ADD COLUMN source_order_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS coupons_source_order_idx
  ON coupons (source_order_id)
  WHERE source_order_id IS NOT NULL;

ALTER TABLE one_time_orders ADD COLUMN coupon_id TEXT;
ALTER TABLE one_time_orders ADD COLUMN coupon_code TEXT;
ALTER TABLE one_time_orders ADD COLUMN discount_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE one_time_orders ADD COLUMN coupon_redeemed_at INTEGER;

CREATE INDEX IF NOT EXISTS one_time_orders_coupon_idx
  ON one_time_orders (coupon_id);
