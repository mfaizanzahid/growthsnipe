import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderLoopsPdf } from "../src/server/loops/pdf";

describe("SNIPE Loops playbook PDF", () => {
  it("renders the branded playbook with a contents section and trade chapters", async () => {
    const bytes = await renderLoopsPdf({
      businessName: "Acme Inspections",
      trade: "Home inspection",
      preparedAt: Date.UTC(2026, 10, 17),
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(20_000);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(20);
  });

  it("renders the standard document without personalization", async () => {
    const bytes = await renderLoopsPdf();
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(20);
  });

  it(
    "renders a shorter edition for one trade and the combined edition for Others",
    async () => {
      const combined = await PDFDocument.load(await renderLoopsPdf());
      const hvac = await PDFDocument.load(await renderLoopsPdf({ trade: "HVAC" }));
      const others = await PDFDocument.load(await renderLoopsPdf({ trade: "Others" }));

      expect(hvac.getPageCount()).toBeLessThan(combined.getPageCount());
      expect(others.getPageCount()).toBe(combined.getPageCount());
    },
    20_000,
  );
});
