-- SNIPE Loops checkout: a $99 one-time product with a standing 100% coupon.
--
-- The coupon makes every Loops order $0 today, so the existing free-order path
-- completes it without a card. The coupon is not email-bound and has no
-- redemption cap or expiry. `document_sent_at` and `welcome_scheduled_at` make
-- the playbook email and the 5-hour welcome sequence idempotent.
INSERT OR IGNORE INTO one_time_products (id, slug, name, amount_minor, currency, active, created_at)
VALUES ('otp_loops', 'loops', 'SNIPE Loops', 9900, 'USD', 1, strftime('%s','now') * 1000);

INSERT OR IGNORE INTO coupons (
  id,
  code,
  kind,
  percent_off,
  amount_off_minor,
  currency,
  duration,
  duration_cycles,
  applies_to_setup,
  max_redemptions,
  redeemed_count,
  valid_from,
  valid_until,
  restricted_email,
  one_time_product_slug,
  source_order_id,
  active,
  created_by,
  created_at,
  updated_at
)
VALUES (
  'cpn_loops100',
  'LOOPS100',
  'percent',
  100,
  NULL,
  'USD',
  'forever',
  NULL,
  0,
  NULL,
  0,
  NULL,
  NULL,
  NULL,
  'loops',
  NULL,
  1,
  'system',
  strftime('%s','now') * 1000,
  strftime('%s','now') * 1000
);

ALTER TABLE one_time_orders ADD COLUMN document_sent_at INTEGER;
ALTER TABLE one_time_orders ADD COLUMN welcome_scheduled_at INTEGER;
