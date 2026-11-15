import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Blueprint discovery call copy", () => {
  it("mentions the 30-minute discovery call and uses the stable redirect link", () => {
    const page = read("src/react-app/pages/marketing/Blueprint.tsx");
    expect(page).toContain("30-minute discovery call");
    expect(page).toContain('href="/blueprint-discovery-call"');
    expect(page).not.toContain('<Link to="/blueprint-discovery-call"');
  });

  it("includes the discovery call in checkout and thank-you copy", () => {
    const checkout = read("src/react-app/pages/checkout/CheckoutBlueprint.tsx");
    expect(checkout).toContain("30-minute discovery call");

    const thankYou = read("src/react-app/pages/checkout/ThankYouBlueprint.tsx");
    expect(thankYou).toContain("30-minute discovery call");
    expect(thankYou).toContain('href="/blueprint-discovery-call"');
  });

  it("mirrors the discovery call in the website strategy doc", () => {
    const strategy = read("docs/copy-content-website-strategy.md");
    expect(strategy).toContain("A 30-minute discovery call with our team.");
    expect(strategy).toContain("/blueprint-discovery-call");
  });
});
