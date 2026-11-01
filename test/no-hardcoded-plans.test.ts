import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SaaS subscription plans are data, never code: the signup picker and
 * onboarding plan step must render from GET /api/plans. This test fails if
 * subscription-style prices appear hard-coded in customer-facing surfaces.
 *
 * One-time offer prices (Diagnostic $199, Blueprint $999, Engine setup and
 * monthly figures) may appear ONLY on the marketing pages listed in
 * docs/copy-content-website-strategy.md, and ONLY via src/lib/offers.ts.
 * Raw offer-price literals anywhere else fail this test.
 *
 * Dollar amounts are only violations when priced like a plan (an interval
 * suffix right after the amount, or plan/commerce words nearby). Plain
 * editorial figures ("a 4,000 slip in average ticket") are allowed.
 */
const SCAN_DIRS = [
  "src/react-app/pages/marketing",
  "src/react-app/components/marketing",
];
const SCAN_FILES = [
  "src/react-app/pages/Onboarding.tsx",
  // Prerender pipeline participates in plan-surface output: it must never
  // bake plan names or prices either.
  "scripts/prerender-entry.tsx",
  "src/react-app/marketing-routes.tsx",
];

const AMOUNT = /\$\s*[\d,]+(?:\.\d{1,2})?/g;
const WINDOW = 40;
const INTERVAL_SUFFIX = /\s*(\/mo\b|\/yr\b|\bper\s+month\b|\bper\s+year\b|\bmonthly\b|\byearly\b)/i;
const COMMERCE_CONTEXT = /\b(starter|launch|growth|plan|price|pricing|billed|billing|subscription|trial)\b/i;

/** File paths in `content` that look like hard-coded plan prices. */
export function findPlanPriceViolations(content: string, file: string): string[] {
  const out: string[] = [];
  for (const m of content.matchAll(AMOUNT)) {
    const start = m.index ?? 0;
    const after = content.slice(start, start + m[0].length + 12);
    const windowText = content.slice(Math.max(0, start - WINDOW), start + m[0].length + WINDOW);
    if (INTERVAL_SUFFIX.test(after) || COMMERCE_CONTEXT.test(windowText)) {
      out.push(`${file}: possible hard-coded plan price near "${m[0]}"`);
    }
  }
  return out;
}

/**
 * Offer-price literals legal ONLY inside src/lib/offers.ts, or on a source
 * line that reads them from OFFERS/OFFER_* (runtime interpolation, not a
 * hard-coded price). Editorial dollar figures without offer words stay legal.
 */
const OFFER_PRICE_LITERALS = [
  "$199",
  "$999",
  "$1,999",
  "$2,999",
  "$3,999",
  "$4,999",
  "$800",
  "$2,000",
  "$4,000",
  "$500",
];
const OFFER_CONTEXT = /\b(diagnostic|blueprint|engine|setup|remaining|credit|checkout|purchase)\b/i;
const OFFERS_IMPORT = /\bOFFERS?\b/;

const FORBIDDEN = [
  /\bStarter\b/, // retired seed plan name (dev data, not product copy)
];

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full));
    else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no hard-coded plans in customer-facing plan surfaces", () => {
  it("marketing pages and onboarding render plans from GET /api/plans only", () => {
    const root = process.cwd();
    const files = [...SCAN_DIRS.flatMap((d) => collectFiles(join(root, d))), ...SCAN_FILES.map((f) => join(root, f))];
    expect(files.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      violations.push(...findPlanPriceViolations(content, file));
      for (const literal of OFFER_PRICE_LITERALS) {
        let idx = content.indexOf(literal);
        while (idx !== -1) {
          const lineStart = content.lastIndexOf("\n", idx);
          const lineEnd = content.indexOf("\n", idx);
          const line = content.slice(lineStart === -1 ? 0 : lineStart, lineEnd === -1 ? undefined : lineEnd);
          const windowText = content.slice(Math.max(0, idx - WINDOW), idx + literal.length + WINDOW);
          if (OFFER_CONTEXT.test(windowText) && !OFFERS_IMPORT.test(line)) {
            violations.push(`${file}: hard-coded offer price "${literal}" — read it from src/lib/offers.ts instead`);
            break;
          }
          idx = content.indexOf(literal, idx + 1);
        }
      }
      for (const pattern of FORBIDDEN) {
        const match = content.match(pattern);
        if (match) violations.push(`${file}: matched ${pattern} near "${match[0]}"`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("flags plan-priced amounts but allows editorial figures", () => {
    expect(findPlanPriceViolations("<p>$19/mo forever</p>", "f")).toHaveLength(1);
    expect(findPlanPriceViolations("<p>$19 per month</p>", "f")).toHaveLength(1);
    expect(findPlanPriceViolations("<p>$190/yr</p>", "f")).toHaveLength(1);
    expect(findPlanPriceViolations("<p>Starter $19</p>", "f")).toHaveLength(1);
    expect(findPlanPriceViolations("<p>caught a $4,000 slip in average ticket before month-end</p>", "f")).toEqual([]);
    expect(findPlanPriceViolations("<p>less than a tank of gas a month</p>", "f")).toEqual([]);
    expect(findPlanPriceViolations("<p>pay 10, get 12</p>", "f")).toEqual([]);
  });

  it("offer pages read prices from the single source of truth", () => {
    const root = process.cwd();
    for (const page of [
      "src/react-app/pages/marketing/Diagnostic.tsx",
      "src/react-app/pages/marketing/Blueprint.tsx",
      "src/react-app/pages/marketing/Engine.tsx",
    ]) {
      const content = readFileSync(join(root, page), "utf8");
      expect(content).toContain("lib/offers");
    }
  });

  it("offer prices live in a single source of truth", async () => {
    const { OFFERS, OFFER_CREDITS } = await import("../src/lib/offers");
    expect(OFFERS.diagnostic.price).toEqual({ amountMinor: 19900, label: "$199" });
    expect(OFFERS.blueprint.price).toEqual({ amountMinor: 99900, label: "$999" });
    expect(OFFERS.engineCore.setup.amountMinor).toBe(299900);
    expect(OFFERS.engineCore.monthly.amountMinor).toBe(199900);
    expect(OFFERS.engineCommand.setup.amountMinor).toBe(499900);
    expect(OFFERS.engineCommand.monthly.amountMinor).toBe(399900);
    expect(OFFER_CREDITS.diagnosticToBlueprint.days).toBe(14);
    expect(OFFER_CREDITS.blueprintToEngine.days).toBe(30);
  });
});
