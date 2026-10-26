import { describe, expect, it } from "vitest";
import {
  agentLeaderboard,
  annualGrowthFullYears,
  annualGrowthRate,
  basketMix,
  droppedAgents,
  firstFullYear,
  inspectorPerformance,
  monthlySeries,
  rangeTotals,
  repeatSplit,
  type StoredOrder,
} from "../src/server/analytics/metrics";
import { splitServices } from "../src/server/analytics/sync";

function order(partial: Partial<StoredOrder> & { scheduledAt: string | null }): StoredOrder {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    status: partial.status ?? "completed",
    scheduledAt: partial.scheduledAt,
    totalMinor: partial.totalMinor ?? 50000,
    inspectorNames: partial.inspectorNames ?? ["Sam"],
    buyingAgentName: partial.buyingAgentName ?? "Agent A",
    buyingAgentEmail: "buyingAgentEmail" in partial ? partial.buyingAgentEmail ?? null : "a@example.com",
    buyingAgentPhone: "buyingAgentPhone" in partial ? partial.buyingAgentPhone ?? null : null,
    serviceNames: partial.serviceNames ?? ["Home Inspection"],
    referralSource: partial.referralSource ?? null,
  };
}

describe("analytics warehouse metrics", () => {
  it("rangeTotals counts revenue completed-only and pending separately", () => {
    const orders = [
      order({ scheduledAt: "2026-03-01T10:00:00Z", status: "completed", totalMinor: 10000 }),
      order({ scheduledAt: "2026-03-02T10:00:00Z", status: "scheduled", totalMinor: 99999 }),
      order({ scheduledAt: "2026-03-03T10:00:00Z", status: "cancelled", totalMinor: 5000 }),
    ];
    const t = rangeTotals(orders, "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z");
    expect(t).toMatchObject({ jobs: 2, completed: 1, pending: 1, cancelled: 1, revenueMinor: 10000, avgTicketMinor: 10000 });
  });

  it("monthlySeries buckets five years and skips cancelled", () => {
    const orders = [
      order({ scheduledAt: "2024-01-15T10:00:00Z", totalMinor: 20000 }),
      order({ scheduledAt: "2024-01-20T10:00:00Z", status: "cancelled", totalMinor: 50000 }),
    ];
    const months = monthlySeries(orders, 5, new Date("2026-10-22T00:00:00Z"));
    const jan = months.find((m) => m.month === "2024-01")!;
    expect(jan.jobs).toBe(1);
    expect(jan.revenueMinor).toBe(20000);
    expect(months.length).toBeGreaterThanOrEqual(60);
  });

  it("monthlySeries marks repeat jobs by trailing-12m agent frequency", () => {
    const orders = [
      order({ scheduledAt: "2025-06-01T10:00:00Z", buyingAgentName: "Rep", buyingAgentEmail: "rep@example.com" }),
      order({ scheduledAt: "2026-03-01T10:00:00Z", buyingAgentName: "Rep", buyingAgentEmail: "rep@example.com" }),
      order({ scheduledAt: "2026-03-02T10:00:00Z", buyingAgentName: "New", buyingAgentEmail: "new@example.com" }),
    ];
    const months = monthlySeries(orders, 5, new Date("2026-10-22T00:00:00Z"));
    expect(months.find((m) => m.month === "2026-03")?.repeatJobs).toBe(1);
    expect(months.find((m) => m.month === "2025-06")?.repeatJobs).toBe(0);
  });

  it("annualGrowthRate returns null on zero baseline, pct otherwise", () => {
    const months = [
      { month: "2024-01", revenueMinor: 0, jobs: 0, completed: 0, avgTicketMinor: null, repeatJobs: 0 },
      { month: "2025-01", revenueMinor: 10000, jobs: 1, completed: 1, avgTicketMinor: 10000, repeatJobs: 0 },
      { month: "2026-01", revenueMinor: 15000, jobs: 1, completed: 1, avgTicketMinor: 15000, repeatJobs: 1 },
    ];
    const g = annualGrowthRate(months);
    expect(g.find((x) => x.year === 2025)?.growthPct).toBeNull();
    expect(g.find((x) => x.year === 2026)?.growthPct).toBe(50);
  });

  it("full-year growth bases on the earliest order year and keeps the current year", () => {
    expect(firstFullYear("2021-10-15T10:00:00Z")).toBe(2021);
    expect(firstFullYear("2021-01-01T00:00:00Z")).toBe(2021);
    expect(firstFullYear(null)).toBeNull();
    const months = [
      { month: "2021-10", revenueMinor: 1000, jobs: 1, completed: 1, avgTicketMinor: 1000, repeatJobs: 0 },
      { month: "2022-01", revenueMinor: 10000, jobs: 1, completed: 1, avgTicketMinor: 10000, repeatJobs: 0 },
      { month: "2023-01", revenueMinor: 15000, jobs: 1, completed: 1, avgTicketMinor: 15000, repeatJobs: 0 },
      { month: "2026-03", revenueMinor: 20000, jobs: 1, completed: 1, avgTicketMinor: 20000, repeatJobs: 0 },
    ];
    const g = annualGrowthFullYears(months, 2021);
    expect(g.map((x) => x.year)).toEqual([2021, 2022, 2023, 2026]);
    expect(g[0]).toMatchObject({ revenueMinor: 1000, growthPct: null });
    expect(g[1]).toMatchObject({ revenueMinor: 10000, growthPct: 900 });
    expect(g[2]).toMatchObject({ revenueMinor: 15000, growthPct: 50 });
    expect(g[3]).toMatchObject({ revenueMinor: 20000, growthPct: 33.3 });
    // Unknown start keeps every year too.
    expect(annualGrowthFullYears(months, null).map((x) => x.year)).toEqual([2021, 2022, 2023, 2026]);
  });

  it("agent identity is email first, phone fallback; leaderboard ranks by revenue", () => {
    const orders = [
      order({ scheduledAt: "2026-03-01T10:00:00Z", buyingAgentName: "Agent A", buyingAgentEmail: "A@EXAMPLE.com", totalMinor: 10000 }),
      order({ scheduledAt: "2026-03-02T10:00:00Z", buyingAgentName: "Agent B", buyingAgentEmail: null, buyingAgentPhone: "(555) 123-4567", totalMinor: 30000 }),
    ];
    const lb = agentLeaderboard(orders, "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z");
    expect(lb[0]?.name).toBe("Agent B");
    expect(lb.find((a) => a.name === "Agent A")?.key).toBe("e:a@example.com");
    expect(lb.find((a) => a.name === "Agent B")?.key).toBe("p:5551234567");
  });

  it("droppedAgents finds prior producers with zero current jobs", () => {
    const orders = [
      order({ scheduledAt: "2026-01-10T10:00:00Z", buyingAgentName: "Gone", buyingAgentEmail: "gone@example.com" }),
      order({ scheduledAt: "2026-03-10T10:00:00Z", buyingAgentName: "Stay", buyingAgentEmail: "stay@example.com" }),
    ];
    const dropped = droppedAgents(orders, "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z", "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z");
    expect(dropped.map((d) => d.name)).toContain("Gone");
    expect(dropped.map((d) => d.name)).not.toContain("Stay");
  });

  it("repeatSplit uses trailing-12m agent frequency", () => {
    const orders = [
      order({ scheduledAt: "2025-06-01T10:00:00Z", buyingAgentName: "Rep", buyingAgentEmail: "rep@example.com" }),
      order({ scheduledAt: "2026-03-01T10:00:00Z", buyingAgentName: "Rep", buyingAgentEmail: "rep@example.com" }),
      order({ scheduledAt: "2026-03-02T10:00:00Z", buyingAgentName: "New", buyingAgentEmail: "new@example.com" }),
    ];
    const s = repeatSplit(orders, "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z");
    expect(s).toMatchObject({ repeatAgentJobs: 1, oneOffAgentJobs: 1 });
  });

  it("inspector utilization divides by active days times target", () => {
    const orders = [
      order({ scheduledAt: "2026-03-01T10:00:00Z", inspectorNames: ["Sam"], totalMinor: 10000 }),
      order({ scheduledAt: "2026-03-01T14:00:00Z", inspectorNames: ["Sam"], totalMinor: 10000 }),
      order({ scheduledAt: "2026-03-02T10:00:00Z", inspectorNames: ["Jo"], totalMinor: 10000 }),
    ];
    const rows = inspectorPerformance(orders, "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z", new Map([["Sam", 2]]));
    const sam = rows.find((r) => r.name === "Sam")!;
    // 2 jobs over 2 active days at 2/day target = 50%
    expect(sam.utilizationPct).toBe(50);
    expect(rows.find((r) => r.name === "Jo")?.utilizationPct).toBeNull();
  });

  it("basketMix ranks service names", () => {
    const orders = [
      order({ scheduledAt: "2026-03-01T10:00:00Z", serviceNames: ["Home Inspection", "Radon"] }),
      order({ scheduledAt: "2026-03-02T10:00:00Z", serviceNames: ["Home Inspection"] }),
    ];
    expect(basketMix(orders, "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z")[0]).toMatchObject({ name: "Home Inspection", jobs: 2 });
  });

  it("splitServices handles both export sites", () => {
    expect(splitServices("Home Inspection, Radon")).toEqual(["Home Inspection", "Radon"]);
    expect(splitServices("A; B | C")).toEqual(["A", "B", "C"]);
  });
});
