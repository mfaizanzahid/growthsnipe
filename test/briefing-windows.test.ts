import { describe, expect, it } from "vitest";
import { cadenceCompares, cadenceSpec } from "../src/server/briefing/cadence";
import { briefingWindows, bucketKeyFor, dayBuckets } from "../src/server/briefing/windows";

const TZ = "Asia/Karachi";

describe("cadence specs", () => {
  it("gives each cadence its own window length and lens", () => {
    expect(cadenceSpec("morning_briefing").windowDays).toBe(1);
    expect(cadenceSpec("weekly_review").windowDays).toBe(7);
    expect(cadenceSpec("monthly_review").windowDays).toBe(30);
    // The bug this fixes: every cadence used to share one prompt and window.
    expect(cadenceSpec("weekly_review").focus).not.toEqual(
      cadenceSpec("morning_briefing").focus,
    );
  });

  it("falls back to a daily briefing for unknown cadences", () => {
    expect(cadenceSpec("nonsense").windowDays).toBe(1);
    expect(cadenceSpec(null).label).toBe("Morning briefing");
    expect(cadenceSpec(undefined).windowDays).toBe(1);
  });

  it("compares every cadence against a previous period", () => {
    expect(cadenceCompares("morning_briefing")).toBe(true);
    expect(cadenceCompares("weekly_review")).toBe(true);
    expect(cadenceCompares("monthly_review")).toBe(true);
  });
});

describe("analysis windows", () => {
  it("daily: covers yesterday, not the day so far", () => {
    // Run at 2026-10-18 07:30 Karachi (02:30 UTC). Yesterday = 17 Oct local.
    // Karachi is UTC+5, so local midnight 18 Oct is 19:00 UTC on the 17th.
    const now = new Date("2026-10-18T02:30:00.000Z");
    const w = briefingWindows("morning_briefing", TZ, now);
    expect(w.current.label).toBe("Yesterday");
    expect(w.current.from).toBe("2026-10-16T19:00:00.000Z"); // local midnight 17 Oct
    expect(w.current.to).toBe("2026-10-17T19:00:00.000Z"); // local midnight 18 Oct
    expect(w.previous?.label).toBe("Previous day");
    expect(w.previous?.from).toBe("2026-10-15T19:00:00.000Z");
    expect(w.previous?.to).toBe("2026-10-16T19:00:00.000Z");
  });

  it("weekly: seven days plus the seven before", () => {
    const now = new Date("2026-10-18T02:30:00.000Z");
    const w = briefingWindows("weekly_review", TZ, now);
    expect(w.current.label).toBe("Last 7 days");
    expect(w.current.days).toBe(7);
    expect(new Date(w.current.to).getTime() - new Date(w.current.from).getTime()).toBe(
      7 * 86_400_000,
    );
    expect(w.previous?.from).toBe("2026-10-03T19:00:00.000Z");
  });

  it("monthly: thirty days plus the thirty before", () => {
    const now = new Date("2026-10-18T02:30:00.000Z");
    const w = briefingWindows("monthly_review", TZ, now);
    expect(w.current.days).toBe(30);
    expect(new Date(w.current.from).toISOString()).toBe("2026-09-17T19:00:00.000Z");
    expect(w.previous?.from).toBe("2026-08-18T19:00:00.000Z");
  });

  it("windows end at local midnight in the workspace zone", () => {
    // 22:00 UTC is already the next day in Karachi (03:00 next day).
    const now = new Date("2026-10-17T22:00:00.000Z"); // 18 Oct 03:00 PKT
    const w = briefingWindows("morning_briefing", TZ, now);
    expect(w.current.to).toBe("2026-10-17T19:00:00.000Z");
    expect(new Date(w.current.to).getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it("uses a different zone without shifting the local day", () => {
    const now = new Date("2026-10-18T02:30:00.000Z"); // 22:30 on the 17th in NY
    const w = briefingWindows("morning_briefing", "America/New_York", now);
    // New York midnight on the 17th = 04:00 UTC.
    expect(w.current.to).toBe("2026-10-17T04:00:00.000Z");
    expect(w.current.from).toBe("2026-10-16T04:00:00.000Z");
  });
});

describe("day buckets", () => {
  it("produces one bucket per local day in the window", () => {
    const now = new Date("2026-10-18T02:30:00.000Z");
    const w = briefingWindows("weekly_review", TZ, now);
    const buckets = dayBuckets(w.current, TZ);
    expect(buckets).toHaveLength(7);
    expect(buckets[0]).toBe("2026-10-11");
    expect(buckets[6]).toBe("2026-10-17");
  });

  it("files an instant into the local day bucket", () => {
    // 23:30 UTC is already the next day in Karachi.
    expect(bucketKeyFor("2026-10-17T23:30:00.000Z", TZ)).toBe("2026-10-18");
    expect(bucketKeyFor("2026-10-17T02:30:00.000Z", TZ)).toBe("2026-10-17");
    expect(bucketKeyFor(undefined, TZ)).toBeNull();
    expect(bucketKeyFor("not-a-date", TZ)).toBeNull();
  });
});