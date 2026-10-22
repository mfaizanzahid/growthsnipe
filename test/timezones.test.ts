import { describe, expect, it } from "vitest";
import { computerTimeZone, localTimeIn } from "../src/react-app/lib/timezones";

describe("computerTimeZone", () => {
  it("returns a zone the runtime can resolve", () => {
    const zone = computerTimeZone();
    expect(zone).toBeTruthy();
    // The runtime can always format its own zone.
    expect(() =>
      new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date()),
    ).not.toThrow();
  });
});

describe("localTimeIn", () => {
  it("formats a wall-clock time for the zone", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    expect(localTimeIn("UTC", now)).toBe("12:00");
    // New York is UTC-4 (daylight saving) in October.
    expect(localTimeIn("America/New_York", now)).toBe("08:00");
  });

  it("degrades instead of throwing on an invalid zone", () => {
    expect(localTimeIn("Not/AZone")).toBe("--:--");
  });
});
