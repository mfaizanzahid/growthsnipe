import { describe, expect, it } from "vitest";
import { parsePlanFeatures } from "../src/react-app/lib/plan-features";

describe("parsePlanFeatures", () => {
  it("splits comma-separated features and trims whitespace", () => {
    expect(parsePlanFeatures("1 user, 3 AI Advisors, Standard support")).toEqual([
      "1 user",
      "3 AI Advisors",
      "Standard support",
    ]);
  });

  it("returns an empty list for null, undefined, or blank input", () => {
    expect(parsePlanFeatures(null)).toEqual([]);
    expect(parsePlanFeatures(undefined)).toEqual([]);
    expect(parsePlanFeatures("  , ,")).toEqual([]);
  });
});
