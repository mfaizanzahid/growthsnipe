import { describe, expect, it } from "vitest";
import { formatMoney, formatWholeMoney } from "../src/react-app/lib/money";

describe("money formatting", () => {
  it("formats cents with decimals", () => {
    expect(formatMoney(1900)).toBe("$19.00");
    expect(formatMoney(1999)).toBe("$19.99");
  });

  it("formats plan prices as whole units", () => {
    expect(formatWholeMoney(1900)).toBe("$19");
    expect(formatWholeMoney(19000)).toBe("$190");
    expect(formatWholeMoney(1949)).toBe("$19");
  });
});
