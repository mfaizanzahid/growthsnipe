import { describe, expect, it } from "vitest";
import { deriveCountryFromPhone } from "../src/server/lib/country";

describe("deriveCountryFromPhone", () => {
  it("derives the ISO country from a +1 (US) phone", () => {
    expect(deriveCountryFromPhone("+12025550123")).toBe("US");
  });

  it("derives the ISO country from a +92 (PK) phone", () => {
    expect(deriveCountryFromPhone("+923001234567")).toBe("PK");
  });

  it("derives the ISO country from a +44 (GB) phone", () => {
    expect(deriveCountryFromPhone("+447911123456")).toBe("GB");
  });

  it("returns the explicit default before attempting phone derivation", () => {
    expect(deriveCountryFromPhone(null, "PK")).toBe("PK");
    expect(deriveCountryFromPhone("+12025550123", "PK")).toBe("PK");
  });

  it("returns null for a bare national number with no configured default", () => {
    expect(deriveCountryFromPhone("3001234567")).toBeNull();
  });

  it("returns null for an empty/undefined phone with no default", () => {
    expect(deriveCountryFromPhone(undefined)).toBeNull();
    expect(deriveCountryFromPhone("")).toBeNull();
  });

  it("returns null for an unknown dialing code", () => {
    expect(deriveCountryFromPhone("+000")).toBeNull();
  });
});
