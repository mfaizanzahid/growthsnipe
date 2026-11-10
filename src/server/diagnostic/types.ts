import { z } from "zod";

export const DIAGNOSTIC_PROVIDERS = ["spectora", "isn"] as const;
export type DiagnosticProvider = (typeof DIAGNOSTIC_PROVIDERS)[number];

export type DiagnosticRunStatus =
  | "awaiting_connection"
  | "syncing"
  | "analyzing"
  | "ready"
  | "ready_email_failed"
  | "failed";

export interface DiagnosticEvidence {
  metricRef: string;
  value: string;
}

export interface DiagnosticExposure {
  lowMinor: number;
  highMinor: number;
  assumptions: string[];
  method: string;
}

export interface DiagnosticLeak {
  id: string;
  category: string;
  title: string;
  evidence: DiagnosticEvidence[];
  quantifiable: boolean;
  exposure?: DiagnosticExposure;
}

export interface DiagnosticScorecardEntry {
  dimension:
    | "demand"
    | "capture"
    | "booking"
    | "ticket"
    | "repeat"
    | "visibility"
    | "capacity"
    | "data";
  label: string;
  score: number;
  status: "strength" | "watch" | "leak" | "unknown";
}

export interface DiagnosticFacts {
  meta: {
    provider: DiagnosticProvider;
    businessName: string | null;
    trade: string | null;
    currency: string;
    generatedAt: string;
    window: { from: string; to: string; monthsCovered: number };
    periodLabel: string;
  };
  baseline: {
    jobs: number;
    completed: number;
    cancelled: number;
    open: number;
    cancelRatePct: number | null;
    revenueMinor: number;
    avgTicketMinor: number | null;
    jobsPerWeek: number | null;
    revenuePerDayMinor: number;
    activeMonths: number;
  };
  trend: {
    monthly: Array<{
      month: string;
      jobs: number;
      completed: number;
      revenueMinor: number;
      avgTicketMinor: number | null;
    }>;
    quarters: Array<{
      quarter: string;
      jobs: number;
      completed: number;
      revenueMinor: number;
      avgTicketMinor: number | null;
    }>;
    yoy: Array<{ year: number; revenueMinor: number; growthPct: number | null }>;
    bestMonth: string | null;
    worstMonth: string | null;
    seasonalityIndex: number | null;
  };
  ticket: {
    distributionMinor: {
      p25: number | null;
      p50: number | null;
      p75: number | null;
      p90: number | null;
      max: number | null;
    };
    unpaid: { count: number; amountMinor: number };
  };
  referrals: {
    activeAgentCount: number;
    topAgents: Array<{
      name: string;
      jobs: number;
      revenueMinor: number;
      sharePct: number;
      lastSeen: string | null;
      status: "active" | "cooling" | "dormant";
    }>;
    topAgencies: Array<{
      name: string;
      jobs: number;
      revenueMinor: number;
      sharePct: number;
    }>;
    droppedAgents: Array<{
      name: string;
      jobs: number;
      revenueMinor: number;
      lastSeen: string | null;
    }>;
    newAgents: Array<{
      name: string;
      jobs: number;
      revenueMinor: number;
      firstSeen: string | null;
    }>;
    repeatAgentSharePct: number | null;
    concentrationIndex: number | null;
  };
  services: {
    mix: Array<{
      name: string;
      jobs: number;
      revenueMinor: number;
      sharePct: number;
    }>;
    addOnAttachPct: number | null;
    avgServicesPerJob: number | null;
  };
  team: {
    inspectorCount: number;
    inspectors: Array<{
      name: string;
      jobs: number;
      revenueMinor: number;
      avgTicketMinor: number | null;
      utilizationPct: number | null;
    }>;
    teamJobSharePct: number | null;
  };
  clients: {
    repeatClientSharePct: number | null;
    avgJobsPerClient: number | null;
    identityCoveragePct: number | null;
  };
  geography: {
    topCities: Array<{
      city: string;
      jobs: number;
      revenueMinor: number;
      sharePct: number;
    }>;
  };
  scorecard: DiagnosticScorecardEntry[];
  leaks: DiagnosticLeak[];
}

const ScorecardDimensionSchema = z.enum([
  "demand",
  "capture",
  "booking",
  "ticket",
  "repeat",
  "visibility",
  "capacity",
  "data",
]);

/**
 * Model output. The model narrates and ranks catalog leaks; it never supplies
 * numbers. Exposure always comes from `DiagnosticFacts.leaks`.
 */
export const DiagnosticNarrativeSchema = z.object({
  snapshot: z.object({
    headline: z.string().min(1).max(120),
    summary: z.string().min(1).max(600),
    scoreRationale: z.string().min(1).max(500),
  }),
  executiveSummary: z.object({
    paragraphs: z.array(z.string().min(1).max(700)).min(1).max(3),
    topFindings: z
      .array(
        z.object({
          title: z.string().min(1).max(120),
          metricRef: z.string().min(1).max(120),
          oneLine: z.string().min(1).max(240),
        }),
      )
      .max(3),
  }),
  scorecardNotes: z
    .array(
      z.object({
        dimension: ScorecardDimensionSchema,
        note: z.string().min(1).max(320),
      }),
    )
    .max(8),
  leakNarratives: z
    .array(
      z.object({
        leakId: z.string().min(1).max(80),
        title: z.string().min(1).max(140),
        severity: z.enum(["critical", "high", "medium", "low"]),
        confidence: z.enum(["high", "medium", "low"]),
        consequence: z.string().min(1).max(420),
        recommendedFix: z.string().min(1).max(520),
        effort: z.enum(["low", "medium", "high"]),
        priorityRank: z.number().int().min(1).max(8),
      }),
    )
    .min(1)
    .max(8),
  quickWins: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        action: z.string().min(1).max(320),
        effortHours: z.number().min(1).max(40),
        metricRef: z.string().min(1).max(120),
      }),
    )
    .max(5),
  ninetyDayPlan: z
    .array(
      z.object({
        window: z.enum(["Days 1-14", "Days 15-45", "Days 46-90"]),
        focus: z.string().min(1).max(180),
        actions: z.array(z.string().min(1).max(220)).min(1).max(4),
        successMetric: z.string().min(1).max(180),
      }),
    )
    .length(3),
  nextStep: z.object({
    recommendation: z.enum([
      "DIY",
      "SNIPE Loops",
      "SNIPE Blueprint",
      "SNIPE Engine Core",
      "SNIPE Engine Command",
    ]),
    rationale: z.string().min(1).max(520),
    creditNote: z.string().max(320),
  }),
  methodology: z.object({
    sources: z.array(z.string().max(160)).min(1).max(8),
    assumptions: z.array(z.string().max(220)).max(12),
    disclaimers: z.array(z.string().max(240)).min(1).max(6),
  }),
});

export type DiagnosticNarrative = z.infer<typeof DiagnosticNarrativeSchema>;
