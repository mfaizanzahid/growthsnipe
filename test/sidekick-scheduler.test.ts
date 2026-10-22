import { describe, expect, it } from "vitest";
import { nextRunAtFor, periodKeyFor } from "../src/server/scheduler/scheduler";
import { periodLabel, scheduleProvider } from "../src/server/scheduler/worker";
import { briefingContent } from "../src/server/email/templates";

describe("briefing schedule cadence", () => {
  it("keys daily periods by date", () => {
    expect(periodKeyFor("morning_briefing", Date.UTC(2026, 8, 10, 12))).toBe("2026-09-10");
  });

  it("keys weekly periods by ISO week and monthly by month", () => {
    const week = periodKeyFor("weekly_review", Date.UTC(2026, 8, 10, 12));
    expect(week).toMatch(/^2026-w\d{2}$/);
    expect(periodKeyFor("monthly_review", Date.UTC(2026, 8, 10, 12))).toBe("2026-09");
  });

  it("advances next runs by the schedule's own wall clock and zone", () => {
    const now = Date.UTC(2026, 8, 10, 12); // Thursday 2026-09-10 17:00 Karachi
    const daily = { type: "morning_briefing", timezone: "Asia/Karachi", localTime: "07:00" };
    expect(nextRunAtFor(daily, now).toISOString()).toBe("2026-09-11T02:00:00.000Z");

    // Weekly lands on the next Monday 07:00 local.
    const weekly = { type: "weekly_review", timezone: "Asia/Karachi", localTime: "07:00" };
    expect(nextRunAtFor(weekly, now).toISOString()).toBe("2026-09-14T02:00:00.000Z");

    // Monthly keeps the same day-of-month, one month later.
    const monthly = { type: "monthly_review", timezone: "Asia/Karachi", localTime: "07:00" };
    expect(nextRunAtFor(monthly, now).toISOString()).toBe("2026-10-10T02:00:00.000Z");
  });

  it("labels each cadence for the email subject", () => {
    expect(periodLabel("morning_briefing")).toBe("Morning briefing");
    expect(periodLabel("weekly_review")).toBe("Weekly review");
    expect(periodLabel("monthly")).toBe("Monthly review");
  });

  it("defaults the provider when ruleJson has no usable provider", () => {
    // Regression: an empty rule blob used to query adapters with an undefined
    // provider key, which failed the connection lookup and killed the briefing.
    expect(scheduleProvider("{}")).toBe("spectora");
    expect(scheduleProvider(null)).toBe("spectora");
    expect(scheduleProvider("not json")).toBe("spectora");
    expect(scheduleProvider('{"provider":"isn"}')).toBe("isn");
    expect(scheduleProvider('{"provider":"nonsense"}')).toBe("spectora");
  });
});

describe("briefing email content", () => {
  const base = {
    orgName: "Jalop",
    periodLabel: "Morning briefing",
    briefingText: "Two inspections booked today.\n\nOne unpaid invoice from Monday.",
    portalName: "Tradesmatic",
    supportEmail: "support@example.com",
    dashboardUrl: "https://example.com/schedules",
  };

  it("subjects the email with the portal, cadence and workspace", () => {
    expect(briefingContent(base).subject).toBe("Tradesmatic Morning briefing briefing for Jalop");
  });

  it("splits the briefing into paragraphs and escapes provider text", () => {
    const html = briefingContent({ ...base, briefingText: "Safe line\nstill safe\n\n<b>injected</b> & co" }).html;
    expect(html).toContain("Safe line<br/>still safe");
    expect(html).toContain("&lt;b&gt;injected&lt;/b&gt; &amp; co");
    expect(html).not.toContain("<b>injected</b>");
  });

  it("falls back to a no-activity line when synthesis returned nothing", () => {
    expect(briefingContent({ ...base, briefingText: "   " }).html).toContain("No new activity");
  });
});
