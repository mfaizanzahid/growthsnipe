import { describe, expect, it } from "vitest";
import { isGtmContainerId } from "../src/react-app/lib/analytics";

describe("isGtmContainerId", () => {
  it("recognizes Tag Manager container IDs", () => {
    expect(isGtmContainerId("GTM-MNQ45DBH")).toBe(true);
    expect(isGtmContainerId(" gtm-abc123 ")).toBe(true);
  });

  it("treats GA4, Ads and Floodlight IDs as gtag destinations", () => {
    expect(isGtmContainerId("G-ABC123XYZ")).toBe(false);
    expect(isGtmContainerId("AW-123456789")).toBe(false);
    expect(isGtmContainerId("DC-1234567")).toBe(false);
    expect(isGtmContainerId("")).toBe(false);
  });
});
