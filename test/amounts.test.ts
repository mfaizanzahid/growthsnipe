import { describe, expect, it } from "vitest";
import { amountToMinorUnits } from "../src/server/lib/http";

describe("amountToMinorUnits", () => {
  it("converts USD decimals to cents", () => {
    expect(amountToMinorUnits(99)).toBe(9900);
    expect(amountToMinorUnits(19.99)).toBe(1999);
  });

  it("rejects invalid amounts", () => {
    expect(() => amountToMinorUnits(-1)).toThrow();
    expect(() => amountToMinorUnits(Number.NaN)).toThrow();
  });
});
