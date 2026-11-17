import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(rel, "utf8");

describe("SNIPE Loops customer copy", () => {
  it("does not expose the internal marketing email sequence", () => {
    const sources = [
      "src/react-app/pages/checkout/CheckoutLoops.tsx",
      "src/react-app/pages/checkout/ThankYouLoops.tsx",
      "src/react-app/components/marketing/page-meta.ts",
    ];
    for (const file of sources) {
      const copy = read(file).toLowerCase();
      expect(copy).not.toContain("email series");
      expect(copy).not.toContain("five hours");
      expect(copy).not.toContain("enrollment");
    }
  });
});
