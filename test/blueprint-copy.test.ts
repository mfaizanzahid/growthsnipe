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
    expect(strategy).toContain("30-minute discovery call with our team");
    expect(strategy).toContain("/blueprint-discovery-call");
  });
});

describe("Blueprint deliverable copy", () => {
  const components = [
    "Baseline and Target Stack",
    "Packaging and Ticket Architecture",
    "Recurring Revenue Models",
    "Lifecycle Funnel Map",
    "Channel Math and Paid Ads Model",
    "Local Authority Plan",
    "Partner Flywheel",
    "Capacity and Hiring Plan",
    "12-Month Roadmap",
    "Guardrail Dashboard",
  ];

  it("lists the delivered components on the Blueprint page", () => {
    const page = read("src/react-app/pages/marketing/Blueprint.tsx");
    for (const name of components) expect(page).toContain(name);
  });

  it("keeps the website strategy doc in sync", () => {
    const strategy = read("docs/copy-content-website-strategy.md");
    for (const name of components) expect(strategy).toContain(name);
  });

  it("uses the shared value stack and removes page counts", () => {
    const page = read("src/react-app/pages/marketing/Blueprint.tsx");
    expect(page).toContain("OfferValueStack");
    expect(page).toContain("OFFER_STACKS");
    const surfaces = [
      "src/react-app/pages/marketing/Blueprint.tsx",
      "src/react-app/pages/checkout/CheckoutBlueprint.tsx",
      "src/react-app/pages/marketing/Faq.tsx",
    ];
    for (const path of surfaces) {
      expect(read(path)).not.toMatch(/25\s*(to|-|–|—)\s*35|35-page|35 page/i);
    }
  });

  it("avoids em dashes in the Blueprint marketing surfaces", () => {
    const surfaces = [
      "src/react-app/pages/marketing/Blueprint.tsx",
      "src/react-app/pages/marketing/Landing.tsx",
      "src/react-app/pages/marketing/Faq.tsx",
      "src/react-app/pages/marketing/HowItWorks.tsx",
      "src/react-app/pages/checkout/CheckoutBlueprint.tsx",
    ];
    for (const path of surfaces) expect(read(path)).not.toContain("\u2014");
  });
});
