import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { buildFacts, metricValue } from "../src/server/diagnostic/facts";
import { diagnosticWindow } from "../src/server/diagnostic/collect";
import { fallbackNarrative, validateNarrative } from "../src/server/diagnostic/synthesize";
import { renderDiagnosticPdf } from "../src/server/diagnostic/pdf";
import { signDiagnosticToken, verifyDiagnosticToken } from "../src/server/diagnostic/tokens";
import type { DiagnosticOrderInsert } from "../src/server/diagnostic/store";
import { DiagnosticNarrativeSchema } from "../src/server/diagnostic/types";

const NOW = new Date("2026-11-01T12:00:00.000Z").getTime();
const WINDOW = {
  from: "2025-11-01T12:00:00.000Z",
  to: "2026-11-01T12:00:00.000Z",
  monthsCovered: 12,
};

function services(items: Array<{ name: string; kind: string; amountMinor: number | null }>): string {
  return JSON.stringify(items);
}

function row(over: Partial<DiagnosticOrderInsert> & { providerOrderId: string }): DiagnosticOrderInsert {
  return {
    id: `run:isn:${over.providerOrderId}`,
    runId: "run",
    status: "completed",
    scheduledAt: "2026-01-15T10:00:00.000Z",
    completedAt: "2026-01-15T12:00:00.000Z",
    totalMinor: 40000,
    currency: "USD",
    paid: 1,
    serviceType: "Base inspection",
    servicesJson: services([{ name: "Base inspection", kind: "base", amountMinor: null }]),
    servicesEnriched: 1,
    inspectorNames: JSON.stringify(["Alex"]),
    buyerName: "Buyer One",
    buyerEmail: "buyer1@example.com",
    buyerPhone: null,
    buyingAgentName: "Agent A",
    buyingAgentEmail: "a@example.com",
    buyingAgentPhone: null,
    agencyName: "Agency A",
    sellingAgentName: null,
    referralSource: null,
    city: "Austin",
    address: "1 Main St, Austin, TX",
    detailsJson: null,
    syncedAt: NOW,
    ...over,
  };
}

function sampleOrders(): DiagnosticOrderInsert[] {
  const addon = services([
    { name: "Base inspection", kind: "base", amountMinor: null },
    { name: "Radon test", kind: "addon", amountMinor: 10000 },
  ]);
  const base = services([{ name: "Base inspection", kind: "base", amountMinor: null }]);
  return [
    row({ providerOrderId: "o1", totalMinor: 40000, servicesJson: addon, scheduledAt: "2026-01-15T10:00:00.000Z" }),
    row({ providerOrderId: "o2", totalMinor: 45000, servicesJson: base, scheduledAt: "2026-03-10T10:00:00.000Z" }),
    row({
      providerOrderId: "o3",
      totalMinor: 50000,
      servicesJson: base,
      scheduledAt: "2026-06-01T10:00:00.000Z",
      buyerEmail: "buyer2@example.com",
      city: "Dallas",
      inspectorNames: JSON.stringify(["Alex", "Sam"]),
    }),
    row({
      providerOrderId: "o4",
      totalMinor: 30000,
      paid: 0,
      buyingAgentName: "Agent B",
      buyingAgentEmail: "b@example.com",
      buyerEmail: "buyer3@example.com",
      scheduledAt: "2026-09-01T10:00:00.000Z",
      inspectorNames: JSON.stringify(["Sam"]),
    }),
    row({
      providerOrderId: "o5",
      status: "cancelled",
      totalMinor: 40000,
      scheduledAt: "2026-10-01T10:00:00.000Z",
      inspectorNames: JSON.stringify([]),
    }),
    row({
      providerOrderId: "o6",
      status: "scheduled",
      totalMinor: null,
      paid: null,
      buyingAgentName: "Agent B",
      buyingAgentEmail: "b@example.com",
      buyerEmail: "buyer4@example.com",
      scheduledAt: "2026-10-20T10:00:00.000Z",
      inspectorNames: JSON.stringify([]),
      servicesJson: services([]),
    }),
  ];
}

function facts() {
  return buildFacts({
    provider: "isn",
    businessName: "Hale Home Inspections",
    trade: "Home inspection",
    currency: "USD",
    window: WINDOW,
    orders: sampleOrders(),
    now: NOW,
  });
}

describe("diagnostic window", () => {
  it("uses the last 12 full months, with the last full month as the end", () => {
    const window = diagnosticWindow(new Date("2026-11-10T12:00:00.000Z").getTime());
    expect(window.from).toBe("2025-11-01T00:00:00.000Z");
    expect(window.to).toBe("2026-11-01T00:00:00.000Z");
    expect(window.monthsCovered).toBe(12);
  });

  it("labels the period in months an owner recognises", () => {
    const f = buildFacts({
      provider: "isn",
      businessName: "Hale Home Inspections",
      trade: "Home inspection",
      currency: "USD",
      window: diagnosticWindow(new Date("2026-11-10T12:00:00.000Z").getTime()),
      orders: sampleOrders(),
      now: NOW,
    });
    expect(f.meta.periodLabel).toBe("Nov 2025 to Oct 2026");
  });
});

describe("diagnostic facts", () => {
  it("computes the baseline from the reviewed orders", () => {
    const f = facts();
    expect(f.baseline.jobs).toBe(5);
    expect(f.baseline.completed).toBe(4);
    expect(f.baseline.cancelled).toBe(1);
    expect(f.baseline.revenueMinor).toBe(165000);
    expect(f.baseline.avgTicketMinor).toBe(41250);
    expect(f.baseline.cancelRatePct).toBeCloseTo(16.7, 1);
  });

  it("ranks named referrers and measures add-on attach", () => {
    const f = facts();
    expect(f.referrals.topAgents[0]?.name).toBe("Agent A");
    expect(f.referrals.topAgents[0]?.sharePct).toBe(60);
    expect(f.services.addOnAttachPct).toBe(20);
    expect(f.ticket.unpaid.amountMinor).toBe(30000);
  });

  it("reports job penetration by jobs, without per-service revenue", () => {
    const f = facts();
    const base = f.services.mix.find((item) => item.name === "Base inspection");
    const radon = f.services.mix.find((item) => item.name === "Radon test");
    expect(base?.penetrationPct).toBe(80);
    expect(radon?.penetrationPct).toBe(20);
    expect(f.services.mix.every((item) => !("revenueMinor" in item))).toBe(true);
  });

  it("produces a leak catalog with code-computed exposure", () => {
    const f = facts();
    const cancellation = f.leaks.find((leak) => leak.category === "cancellation");
    expect(cancellation?.quantifiable).toBe(true);
    expect(cancellation?.exposure?.lowMinor).toBe(8250);
    expect(cancellation?.exposure?.highMinor).toBe(16500);
    expect(f.leaks.some((leak) => leak.category === "ticket")).toBe(true);
    expect(f.leaks.some((leak) => leak.category === "referral")).toBe(true);
  });

  it("scores the five SNIPE pillars and leaves Instant Capture not assessed", () => {
    const f = facts();
    expect(f.framework.map((pillar) => pillar.code)).toEqual(["S", "N", "I", "P", "E"]);
    const instant = f.framework.find((pillar) => pillar.code === "I");
    expect(instant?.score).toBeNull();
    expect(instant?.status).toBe("not_assessed");
    for (const pillar of f.framework.filter((item) => item.code !== "I")) {
      expect(pillar.score === null || (pillar.score >= 0 && pillar.score <= 100)).toBe(true);
    }
  });

  it("resolves nested and indexed metric references", () => {
    const f = facts();
    expect(metricValue(f, "baseline.cancelRatePct")).toBe(16.7);
    expect(metricValue(f, "referrals.topAgents[0].sharePct")).toBe(60);
    expect(metricValue(f, "unknown.path")).toBeUndefined();
  });
});

describe("diagnostic narrative validation", () => {
  it("accepts the deterministic fallback", () => {
    const f = facts();
    const narrative = fallbackNarrative(f);
    expect(DiagnosticNarrativeSchema.safeParse(narrative).success).toBe(true);
    expect(validateNarrative(f, narrative).ok).toBe(true);
    expect(narrative.quickWins.length).toBeGreaterThan(0);
    expect(narrative.frameworkNotes.map((note) => note.pillar)).toEqual(["S", "N", "I", "P", "E"]);
    expect(narrative.thirtyDayPlan.map((phase) => phase.window)).toEqual([
      "Days 1-7",
      "Days 8-21",
      "Days 22-30",
    ]);
  });

  it("rejects an unknown leak id", () => {
    const f = facts();
    const narrative = fallbackNarrative(f);
    narrative.leakNarratives[0]!.leakId = "does-not-exist";
    const result = validateNarrative(f, narrative);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("unknown leakId");
  });

  it("rejects an unknown metric reference", () => {
    const f = facts();
    const narrative = fallbackNarrative(f);
    narrative.quickWins = [
      {
        title: "Test",
        what: "Test action",
        when: "This week",
        how: "Test how",
        effortHours: 2,
        metricRef: "made.up.metric",
      },
    ];
    const result = validateNarrative(f, narrative);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("unknown metricRef");
  });
});

describe("diagnostic tokens", () => {
  const env = {
    DIAGNOSTIC_TOKEN_SECRET: "test-diagnostic-secret",
    BETTER_AUTH_SECRET: "test-auth-secret",
  };

  it("round-trips a connect token", async () => {
    const token = await signDiagnosticToken(env, { orderId: "order-1", purpose: "connect", now: NOW });
    await expect(verifyDiagnosticToken(env, token, "connect", NOW)).resolves.toBe("order-1");
  });

  it("rejects a token used for the wrong purpose or after expiry", async () => {
    const token = await signDiagnosticToken(env, { orderId: "order-1", purpose: "connect", now: NOW });
    await expect(verifyDiagnosticToken(env, token, "report", NOW)).resolves.toBeNull();
    const short = await signDiagnosticToken(env, {
      orderId: "order-1",
      purpose: "report",
      ttlSeconds: 60,
      now: NOW,
    });
    await expect(verifyDiagnosticToken(env, short, "report", NOW + 120_000)).resolves.toBeNull();
  });
});

describe("diagnostic pdf", () => {
  it("renders a multi-page report", async () => {
    const f = facts();
    const narrative = fallbackNarrative(f);
    const bytes = await renderDiagnosticPdf(f, narrative);
    expect(bytes.byteLength).toBeGreaterThan(5000);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(15);
  });

  it("adds clickable table of contents links", async () => {
    const f = facts();
    const narrative = fallbackNarrative(f);
    const bytes = await renderDiagnosticPdf(f, narrative);
    const doc = await PDFDocument.load(bytes);
    const tocPage = doc.getPage(1);
    const annots = tocPage.node.lookup(PDFName.of("Annots"), PDFArray);
    expect(annots).toBeDefined();
    expect(annots!.size()).toBeGreaterThan(5);
    const first = annots!.lookup(0) as PDFDict;
    const action = first.lookup(PDFName.of("A"), PDFDict);
    const destination = action.lookup(PDFName.of("D"), PDFArray);
    expect(destination.size()).toBeGreaterThan(1);
  });
});
