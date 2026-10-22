import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Plans are data, never code: the pricing page, signup picker, and onboarding
 * plan step must render from GET /api/plans. This test fails if plan names or
 * plan prices appear hard-coded in the customer-facing plan surfaces.
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
  // Prerender pipeline participates in plan-surface output (pricing shell
  // copy): it must never bake plan names or prices either.
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

  it("pricing page reads the plans API", () => {
    const pricing = readFileSync(join(process.cwd(), "src/react-app/pages/marketing/Pricing.tsx"), "utf8");
    expect(pricing).toContain("/api/plans");
  });
});
