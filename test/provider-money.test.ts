import { describe, expect, it } from "vitest";
import { sumMinor, toMinorUnits } from "../src/server/providers/money";

describe("provider money normalization", () => {
  it("converts major units to integer minor units", () => {
    // Vendor shapes actually observed: Spectora quote string, ISN totalfee number.
    expect(toMinorUnits("450.0")).toBe(45000);
    expect(toMinorUnits(450)).toBe(45000);
    expect(toMinorUnits("987.53")).toBe(98753);
    expect(toMinorUnits(0)).toBe(0);
    // Sub-cent input rounds rather than truncating away money.
    expect(toMinorUnits("19.995")).toBe(2000);
  });

  it("tolerates grouping separators and padding", () => {
    expect(toMinorUnits(" 1,234.56 ")).toBe(123456);
    expect(toMinorUnits("1,000")).toBe(100000);
  });

  it("returns undefined instead of guessing for unusable input", () => {
    // A missing total must not become $0 in a briefing.
    expect(toMinorUnits(undefined)).toBeUndefined();
    expect(toMinorUnits(null)).toBeUndefined();
    expect(toMinorUnits("")).toBeUndefined();
    expect(toMinorUnits("   ")).toBeUndefined();
    expect(toMinorUnits("abc")).toBeUndefined();
    expect(toMinorUnits(Number.NaN)).toBeUndefined();
    expect(toMinorUnits(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(toMinorUnits(-5)).toBeUndefined();
    expect(toMinorUnits({})).toBeUndefined();
  });

  it("sums minor amounts, skipping missing entries", () => {
    expect(sumMinor([45000, undefined, 5000])).toBe(50000);
    expect(sumMinor([])).toBe(0);
    expect(sumMinor([undefined, undefined])).toBe(0);
  });
});