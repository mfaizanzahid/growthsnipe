/**
 * Single source of truth for one-time offer pricing and credit rules.
 *
 * Marketing pages, checkout, FAQ, and emails must read prices from here —
 * never hard-code $199 / $999 / $1,999 / $3,999 literals elsewhere. The
 * SaaS subscription plans still come from GET /api/plans; this module covers
 * only the one-time offers from the website strategy.
 */

export interface OfferPrice {
  /** Minor units (cents), USD only. */
  amountMinor: number;
  label: string;
}

export const OFFERS = {
  diagnostic: {
    id: "diagnostic",
    name: "SNIPE Diagnostic™",
    price: { amountMinor: 19900, label: "$199" },
    kind: "one-time",
    checkoutPath: "/checkout/diagnostic",
  },
  blueprint: {
    id: "blueprint",
    name: "SNIPE Blueprint™",
    price: { amountMinor: 99900, label: "$999" },
    kind: "one-time",
    checkoutPath: "/checkout/blueprint",
  },
  engineCore: {
    id: "engine-core",
    name: "SNIPE Engine™ Core",
    setup: { amountMinor: 299900, label: "$2,999" },
    monthly: { amountMinor: 199900, label: "$1,999" },
    adSpendCap: { amountMinor: 300000, label: "$3,000" },
    kind: "scoped",
    comparePath: "/engine",
  },
  engineCommand: {
    id: "engine-command",
    name: "SNIPE Engine™ Command",
    setup: { amountMinor: 499900, label: "$4,999" },
    monthly: { amountMinor: 399900, label: "$3,999" },
    adSpendCap: { amountMinor: 1000000, label: "$10,000" },
    kind: "scoped",
    comparePath: "/engine",
  },
} as const;

export type OfferId = keyof typeof OFFERS;

/** Command overage blocks and other priced line items referenced in copy. */
export const OFFER_EXTRAS = {
  extraHoursBlock: { amountMinor: 50000, label: "$500", unit: "20-hour block" },
} as const;

/** Credit-forward rules, in plain words for UI copy. */
export const OFFER_CREDITS = {
  diagnosticToBlueprint: {
    days: 14,
    text: "Your $199 SNIPE Diagnostic™ fee is credited toward a SNIPE Blueprint™ purchased within 14 days. Your remaining Blueprint payment is $800.",
  },
  blueprintToEngine: {
    days: 30,
    text: "Your $999 SNIPE Blueprint™ fee is credited toward SNIPE Engine™ setup if you sign within 30 days of your Blueprint presentation.",
  },
} as const;
