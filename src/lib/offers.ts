/**
 * Single source of truth for one-time offer pricing, value stacks and credit rules.
 *
 * Marketing pages, checkout, FAQ, and emails must read prices from here.
 * Never hard-code $199 / $999 / $1,999 / $3,999 literals elsewhere. The
 * SaaS subscription plans still come from GET /api/plans; this module covers
 * only the offers from the website strategy.
 */

export interface OfferPrice {
  /** Minor units (cents), USD only. */
  amountMinor: number;
  label: string;
}

export const OFFERS = {
  loops: {
    id: "loops",
    name: "SNIPE Loops™",
    /** Retail-equivalent positioning value, not a market price. */
    value: { amountMinor: 9900, label: "$99" },
    /** List price before the standing 100% discount. */
    listPrice: { amountMinor: 9900, label: "$99" },
    price: { amountMinor: 0, label: "$0" },
    discountPercent: 100,
    kind: "free",
    path: "/loop-library",
    checkoutPath: "/checkout/loops",
    thankYouPath: "/thank-you/loops",
    /** Standing 100% coupon applied automatically at Loops checkout. */
    promoCode: "LOOPS100",
  },
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
    /**
     * Coupon expiry from the Blueprint purchase date. The extra 15 days
     * approximate the 10-business-day delivery window before the 30-day
     * presentation credit window starts. Superadmin can extend it.
     */
    expiryDays: 45,
    text: "Your $999 SNIPE Blueprint™ fee is credited toward SNIPE Engine™ setup if you sign within 30 days of your Blueprint presentation.",
  },
} as const;

/** Reusable ladder copy: every higher offer includes the offers below it. */
export const OFFER_LADDER = {
  loopsIncluded:
    "SNIPE Loops™ is included as a bonus with the SNIPE Diagnostic™, SNIPE Blueprint™ and SNIPE Engine™.",
  diagnosticIncluded:
    "The SNIPE Diagnostic™ is included as a bonus with the SNIPE Blueprint™ and SNIPE Engine™.",
  blueprintIncluded:
    "The SNIPE Blueprint™ is included as a bonus with SNIPE Engine™.",
} as const;

/** Retail-equivalent value estimates must always read as estimates. */
export const OFFER_VALUE_DISCLAIMER =
  "Estimated values are retail-equivalent positioning estimates, not independently established market prices. They are not a promise of resale value or business results.";

export const OFFER_VALUE_DISCLAIMER_SHORT =
  "Estimated values are retail-equivalent positioning estimates, not market prices.";

export type OfferBonusKind = "product" | "call" | "asset" | "credit";

export interface OfferBonus {
  id: string;
  name: string;
  body: string;
  value: OfferPrice;
  kind: OfferBonusKind;
  /** Set when the bonus is an earlier offer carried forward. */
  fromOfferId?: "loops" | "diagnostic" | "blueprint";
}

export interface OfferStackCore {
  name: string;
  body: string;
  /** Null when the core engagement is scoped rather than priced. */
  value: OfferPrice | null;
  /** Checklist rendered under the core offer. */
  features: string[];
}

export interface OfferStackCta {
  label: string;
  href: string;
}

export interface OfferStack {
  id: "loops" | "diagnostic" | "blueprint" | "engine";
  eyebrow: string;
  core: OfferStackCore;
  bonuses: OfferBonus[];
  deliverableValue: OfferPrice;
  creditValue: OfferPrice | null;
  totalValue: OfferPrice;
  price: OfferPrice | null;
  /** Display override, used for "Free" on Loops. */
  priceDisplay: string | null;
  savings: OfferPrice | null;
  discountPercent: number | null;
  totalLabel: string;
  priceLabel: string;
  priceNote: string | null;
  /** When present, the price row renders a button instead of a figure. */
  priceCta: OfferStackCta | null;
  /** Main CTA, centralized in the value stack and reused across page sections. */
  cta: OfferStackCta;
  ctaNote: string;
}

function formatUsd(amountMinor: number): string {
  const dollars = Math.round(amountMinor / 100).toString();
  return `$${dollars.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function offerPrice(amountMinor: number): OfferPrice {
  return { amountMinor, label: formatUsd(amountMinor) };
}

function sumPrices(prices: OfferPrice[]): OfferPrice {
  return offerPrice(prices.reduce((total, price) => total + price.amountMinor, 0));
}

function subtractPrices(a: OfferPrice, b: OfferPrice): OfferPrice {
  return offerPrice(Math.max(0, a.amountMinor - b.amountMinor));
}

const loopsBonus: OfferBonus = {
  id: "bonus-loops",
  name: OFFERS.loops.name,
  body: "The full SNIPE Loops™ library: six loop categories, trade-specific recipes and follow-up scripts.",
  value: OFFERS.loops.value,
  kind: "product",
  fromOfferId: "loops",
};

const diagnosticBonus: OfferBonus = {
  id: "bonus-diagnostic",
  name: OFFERS.diagnostic.name,
  body: "The 12-month baseline and leak review, included so the plan starts from evidence instead of guesses.",
  value: OFFERS.diagnostic.price,
  kind: "product",
  fromOfferId: "diagnostic",
};

const blueprintBonus: OfferBonus = {
  id: "bonus-blueprint",
  name: OFFERS.blueprint.name,
  body: `The full 12-month growth plan, included so the operating work starts from a documented plan. Already own it? The ${OFFERS.blueprint.price.label} you paid is credited toward setup.`,
  value: OFFERS.blueprint.price,
  kind: "product",
  fromOfferId: "blueprint",
};

const loopsBonuses: OfferBonus[] = [
  {
    id: "loops-unbooked-recipe",
    name: "The Unbooked Enquiry Follow-Up Loop",
    body: "Removes the what-do-I-send-next problem. A complete five-step recipe you can copy into your process.",
    value: offerPrice(3900),
    kind: "asset",
  },
  {
    id: "loops-scripts",
    name: "Follow-up script library",
    body: "Removes the wording problem. Call, text and email scripts you can adapt without starting from scratch.",
    value: offerPrice(4700),
    kind: "asset",
  },
  {
    id: "loops-updates",
    name: "Ongoing library updates and new recipes",
    body: "Removes the it-goes-stale problem. New recipes and trade examples are added to the library over time.",
    value: offerPrice(5900),
    kind: "asset",
  },
];

const diagnosticBonuses: OfferBonus[] = [
  loopsBonus,
  {
    id: "diagnostic-review-call",
    name: "30-minute findings and recommendations call",
    body: "Removes the what-do-I-do-next problem. A live walkthrough of the findings and a recommended next step.",
    value: offerPrice(14900),
    kind: "call",
  },
  {
    id: "diagnostic-data-checklist",
    name: "Data checklist and secure submission guide",
    body: "Removes the what-do-I-send problem. A clear checklist and secure submission instructions.",
    value: offerPrice(4900),
    kind: "asset",
  },
  {
    id: "diagnostic-framework-scores",
    name: "SNIPE System framework scores",
    body: "Removes the where-do-I-stand problem. Scores against the SNIPE System so you can see which part of the business needs attention first.",
    value: offerPrice(9900),
    kind: "asset",
  },
  {
    id: "diagnostic-blueprint-credit",
    name: "Blueprint credit",
    body: `Your ${OFFERS.diagnostic.price.label} fee is credited toward a SNIPE Blueprint™ purchased within 14 days of your review.`,
    value: OFFERS.diagnostic.price,
    kind: "credit",
  },
];

const blueprintBonuses: OfferBonus[] = [
  diagnosticBonus,
  loopsBonus,
  {
    id: "blueprint-discovery-call",
    name: "30-minute discovery call",
    body: "Removes the where-do-we-start problem. A 30-minute call to confirm goals, data access and timing.",
    value: offerPrice(14900),
    kind: "call",
  },
  {
    id: "blueprint-presentation",
    name: "90-minute presentation call and walkthrough",
    body: "Removes the I-do-not-understand-the-tradeoffs problem. A 90-minute walkthrough of the plan, assumptions and economics.",
    value: offerPrice(29900),
    kind: "call",
  },
  {
    id: "blueprint-follow-up",
    name: "30 days of follow-up questions",
    body: "Removes the who-do-I-ask problem. 30 days of follow-up questions after the presentation.",
    value: offerPrice(19900),
    kind: "asset",
  },
  {
    id: "blueprint-intake",
    name: "Intake checklist and data-substitution guide",
    body: "Removes the what-data-do-you-need problem. A clear intake checklist and substitution guide.",
    value: offerPrice(4900),
    kind: "asset",
  },
  {
    id: "blueprint-engine-credit",
    name: "Engine setup credit",
    body: `Your ${OFFERS.blueprint.price.label} fee is credited toward SNIPE Engine™ setup if you sign within 30 days of your presentation.`,
    value: OFFERS.blueprint.price,
    kind: "credit",
  },
];

const engineBonuses: OfferBonus[] = [
  blueprintBonus,
  diagnosticBonus,
  loopsBonus,
  {
    id: "engine-launch-runway",
    name: "21-day launch runway",
    body: "Removes the we-bought-software-and-nothing-happened problem. A focused onboarding sequence for access, tracking, phone and lead routing, CRM configuration, priority workflows and initial campaign launch, subject to timely access, approvals and third-party dependencies.",
    value: offerPrice(149900),
    kind: "asset",
  },
  {
    id: "engine-voip",
    name: "VoIP migration and multi-line routing",
    body: "Removes the our-phones-are-a-mess problem. VoIP migration, multi-line routing and extended-hours coverage, set up in the agreed scope.",
    value: offerPrice(49900),
    kind: "asset",
  },
  {
    id: "engine-gbp",
    name: "Google Business Profile and service-area setup",
    body: "Removes the we-are-invisible-in-local-search problem. Profile and service-area setup, included in the agreed scope.",
    value: offerPrice(49900),
    kind: "asset",
  },
  {
    id: "engine-booking-config",
    name: "Booking-platform configuration and custom integrations",
    body: "Removes the our-software-does-not-connect problem. Booking-platform configuration and custom integration work, included in the agreed scope.",
    value: offerPrice(74900),
    kind: "asset",
  },
  {
    id: "engine-plan-reviews",
    name: "Recurring plan review calls",
    body: "Removes the we-set-it-and-forgot-it problem. Recurring plan review calls keep the plan tied to your numbers.",
    value: offerPrice(59900),
    kind: "call",
  },
];

const loopsDeliverable = sumPrices([OFFERS.loops.value, ...loopsBonuses.map((bonus) => bonus.value)]);
const diagnosticDeliverable = sumPrices([
  OFFERS.diagnostic.price,
  ...diagnosticBonuses.filter((bonus) => bonus.kind !== "credit").map((bonus) => bonus.value),
]);
const diagnosticCredit = sumPrices(
  diagnosticBonuses.filter((bonus) => bonus.kind === "credit").map((bonus) => bonus.value),
);
const diagnosticTotal = sumPrices([diagnosticDeliverable, diagnosticCredit]);
const blueprintDeliverable = sumPrices([
  OFFERS.blueprint.price,
  ...blueprintBonuses.filter((bonus) => bonus.kind !== "credit").map((bonus) => bonus.value),
]);
const blueprintCredit = sumPrices(
  blueprintBonuses.filter((bonus) => bonus.kind === "credit").map((bonus) => bonus.value),
);
const blueprintTotal = sumPrices([blueprintDeliverable, blueprintCredit]);
const engineTotal = sumPrices(engineBonuses.map((bonus) => bonus.value));

export const OFFER_STACKS: Record<"loops" | "diagnostic" | "blueprint" | "engine", OfferStack> = {
  loops: {
    id: "loops",
    eyebrow: "Your first bonus",
    core: {
      name: OFFERS.loops.name,
      body: "The full library price is free today. Start with the loop that fixes the most obvious gap in your business.",
      value: OFFERS.loops.value,
      features: [
        "Six loop categories",
        "Trade-specific examples",
        "Customer lifecycle map",
        "Sample end-to-end recipe",
      ],
    },
    bonuses: loopsBonuses,
    deliverableValue: loopsDeliverable,
    creditValue: null,
    totalValue: loopsDeliverable,
    price: OFFERS.loops.price,
    priceDisplay: "Free",
    savings: subtractPrices(loopsDeliverable, OFFERS.loops.price),
    discountPercent: OFFERS.loops.discountPercent,
    totalLabel: "Total value",
    priceLabel: "You pay",
    priceNote: null,
    priceCta: null,
    cta: { label: "Get SNIPE Loops™ Free", href: OFFERS.loops.checkoutPath },
    ctaNote:
      "Free today. No card required. Best for owners who want a better follow-up system without starting with a software project.",
  },
  diagnostic: {
    id: "diagnostic",
    eyebrow: "Diagnostic value stack",
    core: {
      name: OFFERS.diagnostic.name,
      body: "A review of up to 12 months of business data, a Leak Map, and Priority Findings ranked by likely impact and practical effort.",
      value: OFFERS.diagnostic.price,
      features: [
        "12-month business review",
        "Business-specific Leak Map",
        "Priority Findings",
        "Service-mix and cancellation review",
        "Referral partner review",
      ],
    },
    bonuses: diagnosticBonuses,
    deliverableValue: diagnosticDeliverable,
    creditValue: diagnosticCredit,
    totalValue: diagnosticTotal,
    price: OFFERS.diagnostic.price,
    priceDisplay: null,
    savings: subtractPrices(diagnosticDeliverable, OFFERS.diagnostic.price),
    discountPercent: null,
    totalLabel: "Total value with credit",
    priceLabel: "You pay",
    priceNote: "One-time payment. Work begins after payment and receipt of the required information.",
    priceCta: null,
    cta: { label: "Get My SNIPE Diagnostic™", href: OFFERS.diagnostic.checkoutPath },
    ctaNote:
      "Best for owner-operated home-service businesses with booking history to review. Where source data is missing or incomplete, we identify the gap rather than invent a number.",
  },
  blueprint: {
    id: "blueprint",
    eyebrow: "Blueprint value stack",
    core: {
      name: OFFERS.blueprint.name,
      body: "A personalized 12-month growth plan covering your baseline and target, packaging, channels, local visibility, recurring revenue, capacity and a phased roadmap.",
      value: OFFERS.blueprint.price,
      features: [
        "Baseline and Target Stack",
        "Packaging and Ticket Architecture",
        "Lifecycle Funnel Map",
        "Channel Math and Paid Ads Model",
        "Local Authority Plan and Partner Flywheel",
        "Capacity and Hiring Plan",
        "12-Month Roadmap and Guardrail Dashboard",
      ],
    },
    bonuses: blueprintBonuses,
    deliverableValue: blueprintDeliverable,
    creditValue: blueprintCredit,
    totalValue: blueprintTotal,
    price: OFFERS.blueprint.price,
    priceDisplay: null,
    savings: subtractPrices(blueprintDeliverable, OFFERS.blueprint.price),
    discountPercent: null,
    totalLabel: "Total value with credit",
    priceLabel: "You pay",
    priceNote: "One-time payment. The delivery window begins after complete intake and data receipt.",
    priceCta: null,
    cta: { label: "Get My SNIPE Blueprint™", href: OFFERS.blueprint.checkoutPath },
    ctaNote:
      "Best for owner-operated home-service businesses with the data and capacity to act on a plan. The Blueprint includes the Diagnostic and SNIPE Loops™ as bonuses.",
  },
  engine: {
    id: "engine",
    eyebrow: "Engine value stack",
    core: {
      name: "SNIPE Engine™",
      body: "We install and help run the marketing, call coverage, CRM, follow-up loops, reputation work and performance visibility. Core and Command are scoped one on one.",
      value: null,
      features: [
        "Marketing and paid media management",
        "Live intake and Voice AI fallback",
        "SNIPE CRM™ configuration",
        "Revenue Loops installed and run",
        "Review and reputation workflows",
        "SNIPE Intelligence™ visibility",
        "Recurring plan review calls",
      ],
    },
    bonuses: engineBonuses,
    deliverableValue: engineTotal,
    creditValue: null,
    totalValue: engineTotal,
    price: null,
    priceDisplay: null,
    savings: null,
    discountPercent: null,
    totalLabel: "Estimated value of included bonuses",
    priceLabel: "Your investment",
    priceNote:
      "Every engagement is scoped one on one. Advertising spend is paid directly by the client.",
    priceCta: { label: "Contact us for pricing", href: "/book" },
    cta: { label: "Contact us for pricing", href: "/book" },
    ctaNote:
      "Best for established home-service businesses ready to hand over the marketing, call coverage and follow-up work. The Blueprint, Diagnostic and SNIPE Loops™ are included as bonuses.",
  },
};
