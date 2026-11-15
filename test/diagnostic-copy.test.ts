import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Diagnostic copy", () => {
  it("does not claim enquiry, lead, response-time, or call analysis", () => {
    const diagnostic = read("src/react-app/pages/marketing/Diagnostic.tsx");
    const checkout = read("src/react-app/pages/checkout/CheckoutDiagnostic.tsx");
    for (const copy of [diagnostic, checkout]) {
      expect(copy).not.toMatch(/enquir|lead|response-time|missed call|call handling|booking conversion/i);
    }
  });

  it("removes enquiry and lead data from Diagnostic FAQ answers", () => {
    const faq = read("src/react-app/pages/marketing/Faq.tsx");
    expect(faq).not.toContain("response-time test");
    expect(faq).not.toContain("lead sources");
    expect(faq).not.toContain("call details");
    expect(faq).not.toContain("estimate status");
    expect(faq).toContain("service and add-on mix, cancellations, referral sources and customer records");
  });

  it("keeps the diagnostic explanation focused on booking data", () => {
    const how = read("src/react-app/pages/marketing/HowItWorks.tsx");
    expect(how).toContain("reviews the available booking data");
    expect(how).not.toContain("friction in acquisition, response, booking");
  });

  it("uses an add-on revenue testimonial in the Diagnostic PDF", () => {
    const pdf = read("src/server/diagnostic/pdf.ts");
    expect(pdf).toContain("add-on revenue we were leaving on the table");
    expect(pdf).not.toContain("missed calls before we signed anything");
  });

  it("removes the old lead and conversion sections from the strategy doc", () => {
    const strategy = read("docs/copy-content-website-strategy.md");
    expect(strategy).not.toContain("Demand and lead sources");
    expect(strategy).not.toContain("Response and capture");
    expect(strategy).not.toContain("Booking and conversion");
    expect(strategy).toContain("Revenue and job volume");
    expect(strategy).toContain("Team and geographic patterns");
  });
});
