import { describe, expect, it } from "vitest";
import {
  cadenceWindowDays,
  isValidTimeZone,
  localDayKey,
  localWeekday,
  nextRunFor,
  parseLocalTime,
  partsInZone,
  zonedWallClockToUtc,
} from "../src/server/lib/local-time";

/** Wall clock of `d` in `tz`, for readable assertions. */
function wall(d: Date, tz: string): string {
  const p = partsInZone(d, tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

describe("zoned wall clock conversion", () => {
  it("maps a local wall clock to the right instant per zone", () => {
    const parts = { year: 2026, month: 10, day: 17, hour: 7, minute: 0, second: 0 };
    // Karachi is UTC+5 year-round.
    expect(zonedWallClockToUtc(parts, "Asia/Karachi").toISOString()).toBe("2026-10-17T02:00:00.000Z");
    // New York on 17 Oct 2026 is UTC-4 (EDT).
    expect(zonedWallClockToUtc(parts, "America/New_York").toISOString()).toBe("2026-10-17T11:00:00.000Z");
    // UTC is itself.
    expect(zonedWallClockToUtc(parts, "UTC").toISOString()).toBe("2026-10-17T07:00:00.000Z");
  });

  it("handles the spring-forward gap (a local hour that does not exist)", () => {
    // US DST 2026 starts 8 Mar. 02:30 local never happens in New York.
    const parts = { year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 };
    const d = zonedWallClockToUtc(parts, "America/New_York");
    expect(Number.isNaN(d.getTime())).toBe(false);
    // Must land on a real instant that still reads as 02:30 or 03:30 local.
    const back = wall(d, "America/New_York");
    expect(back === "2026-03-08 02:30" || back === "2026-03-08 03:30").toBe(true);
  });

  it("handles the fall-back overlap without regressing a day", () => {
    // US DST 2026 ends 1 Nov; 01:30 local happens twice.
    const parts = { year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 };
    const d = zonedWallClockToUtc(parts, "America/New_York");
    expect(wall(d, "America/New_York")).toBe("2026-11-01 01:30");
  });
});

describe("zone introspection", () => {
  it("reports local day keys and weekdays in the target zone", () => {
    const instant = new Date("2026-10-18T02:00:00.000Z"); // 07:00 Karachi on the 18th
    expect(localDayKey(instant, "Asia/Karachi")).toBe("2026-10-18");
    // Still the 17th in New York (22:00 on the 17th).
    expect(localDayKey(instant, "America/New_York")).toBe("2026-10-17");
    expect(localWeekday(instant, "UTC")).toBe(0); // Sunday
  });

  it("validates time zones and local times", () => {
    expect(isValidTimeZone("Asia/Karachi")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(parseLocalTime("07:00")).toEqual({ hour: 7, minute: 0 });
    expect(parseLocalTime("23:59")).toEqual({ hour: 23, minute: 59 });
    expect(() => parseLocalTime("7:00")).toThrow();
    expect(() => parseLocalTime("24:00")).toThrow();
  });
});

describe("next run computation", () => {
  it("daily: next occurrence of the local time", () => {
    // From 2026-10-17 09:00 UTC (= 14:00 Karachi), 07:00 Karachi already passed
    // today, so the next run is tomorrow 07:00 Karachi = 02:00 UTC.
    const from = new Date("2026-10-17T09:00:00.000Z");
    const next = nextRunFor("morning_briefing", "Asia/Karachi", "07:00", from);
    expect(next.toISOString()).toBe("2026-10-18T02:00:00.000Z");
    expect(wall(next, "Asia/Karachi")).toBe("2026-10-18 07:00");
  });

  it("daily: still today when the local time has not arrived", () => {
    // 02:00 UTC is 07:00 Karachi — the next run is that same instant.
    const from = new Date("2026-10-17T00:00:00.000Z");
    const next = nextRunFor("morning_briefing", "Asia/Karachi", "07:00", from);
    expect(next.toISOString()).toBe("2026-10-17T02:00:00.000Z");
  });

  it("daily: always advances strictly forward", () => {
    const from = new Date("2026-10-17T02:00:00.000Z"); // exactly 07:00 Karachi
    const next = nextRunFor("morning_briefing", "Asia/Karachi", "07:00", from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
    expect(wall(next, "Asia/Karachi")).toBe("2026-10-18 07:00");
  });

  it("weekly: lands on the next Monday at the local time", () => {
    // 2026-10-17 is a Friday.
    const from = new Date("2026-10-16T12:00:00.000Z");
    const next = nextRunFor("weekly_review", "Asia/Karachi", "07:00", from);
    expect(localWeekday(next, "Asia/Karachi")).toBe(1); // Monday
    expect(wall(next, "Asia/Karachi")).toBe("2026-10-19 07:00");
  });

  it("weekly: rolls to the following week when Monday's time already passed", () => {
    // Monday 2026-10-19, 10:00 Karachi — past 07:00.
    const from = new Date("2026-10-19T05:00:00.000Z");
    const next = nextRunFor("weekly_review", "Asia/Karachi", "07:00", from);
    expect(wall(next, "Asia/Karachi")).toBe("2026-10-26 07:00");
  });

  it("monthly: same day-of-month next month", () => {
    const from = new Date("2026-10-09T12:00:00.000Z");
    const next = nextRunFor("monthly_review", "Asia/Karachi", "07:00", from);
    expect(wall(next, "Asia/Karachi")).toBe("2026-11-09 07:00");
  });

  it("monthly: clamps to the last valid day when the day does not exist", () => {
    // 31 Oct + 1 month → 30 Nov (November has 30 days).
    const from = new Date("2026-10-31T12:00:00.000Z");
    const next = nextRunFor("monthly_review", "Asia/Karachi", "07:00", from);
    expect(wall(next, "Asia/Karachi")).toBe("2026-11-30 07:00");
  });

  it("weekly: honors an explicit day-of-week", () => {
    // Friday 2026-10-17 → next Wednesday 2026-10-21.
    const from = new Date("2026-10-16T12:00:00.000Z");
    const next = nextRunFor("weekly_review", "Asia/Karachi", "07:00", from, { dayOfWeek: 3 });
    expect(localWeekday(next, "Asia/Karachi")).toBe(3);
    expect(wall(next, "Asia/Karachi")).toBe("2026-10-21 07:00");
  });

  it("weekly: an explicit day-of-week still fires today when the time is ahead", () => {
    // Monday 2026-10-19 05:00 Karachi, 07:00 not reached yet.
    const from = new Date("2026-10-19T00:00:00.000Z");
    const next = nextRunFor("weekly_review", "Asia/Karachi", "07:00", from, { dayOfWeek: 1 });
    expect(wall(next, "Asia/Karachi")).toBe("2026-10-19 07:00");
  });

  it("monthly: honors an explicit day-of-month in the current month", () => {
    // 9 Oct 2026; day 20 is still ahead this month.
    const from = new Date("2026-10-09T12:00:00.000Z");
    const next = nextRunFor("monthly_review", "Asia/Karachi", "07:00", from, { dayOfMonth: 20 });
    expect(wall(next, "Asia/Karachi")).toBe("2026-10-20 07:00");
  });

  it("monthly: rolls past a chosen day that already passed this month", () => {
    const from = new Date("2026-10-25T12:00:00.000Z");
    const next = nextRunFor("monthly_review", "Asia/Karachi", "07:00", from, { dayOfMonth: 20 });
    expect(wall(next, "Asia/Karachi")).toBe("2026-11-20 07:00");
  });

  it("survives a DST transition for a daily schedule", () => {
    // US DST starts 8 Mar 2026. A 07:00 New York daily schedule must keep
    // firing at 07:00 local even though the UTC offset shifts.
    const from = new Date("2026-03-07T12:00:00.000Z");
    const next = nextRunFor("morning_briefing", "America/New_York", "07:00", from);
    expect(wall(next, "America/New_York")).toBe("2026-03-08 07:00");
    // 07:00 EDT is 11:00 UTC (the day before, EST, would have been 12:00).
    expect(next.toISOString()).toBe("2026-03-08T11:00:00.000Z");
  });

  it("keeps a fixed local hour across a DST change (two consecutive runs)", () => {
    const first = nextRunFor("morning_briefing", "America/New_York", "07:00", new Date("2026-03-07T12:00:00.000Z"));
    const second = nextRunFor("morning_briefing", "America/New_York", "07:00", first);
    expect(wall(first, "America/New_York")).toBe("2026-03-08 07:00");
    expect(wall(second, "America/New_York")).toBe("2026-03-09 07:00");
  });
});

describe("cadence windows", () => {
  it("maps each cadence to its period length", () => {
    expect(cadenceWindowDays("morning_briefing")).toBe(1);
    expect(cadenceWindowDays("weekly_review")).toBe(7);
    expect(cadenceWindowDays("monthly_review")).toBe(30);
    expect(cadenceWindowDays("something-new")).toBe(1);
  });
});