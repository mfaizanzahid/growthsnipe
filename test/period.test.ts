import { describe, expect, it } from "vitest";
import { allTimeLabel, inclusiveEndDate, presetRange, type Preset } from "../src/react-app/lib/period";

describe("presetRange calendar boundaries", () => {
  // Calendar presets must serialize to UTC midnights on the 01st, not
  // local-midnight instants that read as the previous month's last date
  // east of UTC and drop early local-morning jobs from UTC month buckets.
  const now = new Date("2026-10-23T07:58:25.214Z");

  it("current month starts on the 01st", () => {
    const r = presetRange("cur_month", "", "", now);
    expect(r.from).toBe("2026-10-01T00:00:00.000Z");
    expect(r.to).toBe("2026-10-24T00:00:00.000Z");
  });

  it("previous month covers exactly that month", () => {
    const r = presetRange("prev_month", "", "", now);
    expect(r.from).toBe("2026-09-01T00:00:00.000Z");
    expect(r.to).toBe("2026-10-01T00:00:00.000Z");
  });

  it("last year covers exactly that year", () => {
    const r = presetRange("last_year", "", "", now);
    expect(r.from).toBe("2025-01-01T00:00:00.000Z");
    expect(r.to).toBe("2026-01-01T00:00:00.000Z");
  });

  it("year to date starts on Jan 01st", () => {
    const r = presetRange("ytd", "", "", now);
    expect(r.from).toBe("2026-01-01T00:00:00.000Z");
    expect(r.to).toBe("2026-10-24T00:00:00.000Z");
  });

  it("handles January wrap for previous month", () => {
    const jan = new Date("2026-01-15T12:00:00.000Z");
    const r = presetRange("prev_month", "", "", jan);
    expect(r.from).toBe("2025-12-01T00:00:00.000Z");
    expect(r.to).toBe("2026-01-01T00:00:00.000Z");
  });

  it("custom passes from through and treats to as through end of day", () => {
    const r = presetRange("custom", "2026-03-01", "2026-03-31", now);
    expect(r).toEqual({ from: "2026-03-01T00:00:00.000Z", to: "2026-04-01T00:00:00.000Z" });
  });

  it("rolling presets align to whole UTC days", () => {
    const r = presetRange("30d", "", "", now);
    expect(r).toEqual({ from: "2026-09-24T00:00:00.000Z", to: "2026-10-24T00:00:00.000Z" });
  });

  it("all time starts at the first order day when known", () => {
    const r = presetRange("all", "", "", now, "2021-06-15T14:30:00.000Z");
    expect(r).toEqual({ from: "2021-06-15T00:00:00.000Z", to: "2026-10-24T00:00:00.000Z" });
  });

  it("all time falls back to 2000 without or with a bad history start", () => {
    expect(presetRange("all", "", "", now).from).toBe("2000-01-01T00:00:00.000Z");
    expect(presetRange("all", "", "", now, null).from).toBe("2000-01-01T00:00:00.000Z");
    expect(presetRange("all", "", "", now, "garbage").from).toBe("2000-01-01T00:00:00.000Z");
  });

  it("all time label carries the history start month and year", () => {
    expect(allTimeLabel("2021-10-15T14:30:00.000Z")).toBe("All time (Oct-2021 onwards)");
    expect(allTimeLabel("2021-01-01T00:00:00.000Z")).toBe("All time (Jan-2021 onwards)");
    expect(allTimeLabel(null)).toBe("All time");
    expect(allTimeLabel("garbage")).toBe("All time");
  });

  it("every preset round-trips through custom dates byte-identically", () => {
    // This is the preset-vs-custom discrepancy as a regression test: the
    // dashboard prefills custom with from.slice(0, 10) plus inclusiveEndDate,
    // and the resolved range must equal the preset's own range exactly.
    const presets: Preset[] = ["30d", "90d", "12m", "ytd", "5y", "cur_month", "prev_month", "last_year", "all"];
    for (const p of presets) {
      const first = presetRange(p, "", "", now);
      const second = presetRange("custom", first.from.slice(0, 10), inclusiveEndDate(first.to), now);
      expect(second, `preset ${p}`).toEqual(first);
    }
  });
});
