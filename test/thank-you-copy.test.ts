import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(rel, "utf8");

describe("thank-you pages", () => {
  it("remind every product buyer to check spam or junk", () => {
    const pages = [
      "src/react-app/pages/checkout/ThankYouDiagnostic.tsx",
      "src/react-app/pages/checkout/ThankYouBlueprint.tsx",
      "src/react-app/pages/checkout/ThankYouLoops.tsx",
    ];
    for (const file of pages) {
      expect(read(file)).toContain("ThankYouEmailNote");
    }
    expect(read("src/react-app/pages/checkout/ThankYouEmailNote.tsx")).toContain(
      "check your spam or junk folder",
    );
  });
});
