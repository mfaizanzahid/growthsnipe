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

export type DiagnosticPillarCode = "S" | "N" | "I" | "P" | "E";

export interface DiagnosticLeak {
  id: string;
  category: string;
  pillar: DiagnosticPillarCode;
  title: string;
  evidence: DiagnosticEvidence[];
  quantifiable: boolean;
  exposure?: DiagnosticExposure;
}

export interface DiagnosticScoreComponent {
  label: string;
  value: string;
  /** 0-100 contribution before weighting; null when the input is unavailable. */
  points: number | null;
  /** Weight within the pillar, 0-1. */
  weight: number;
  /** Human-readable rule shown in the scoring appendix. */
  rule: string;
}

export interface DiagnosticPillar {
  code: DiagnosticPillarCode;
  name: string;
  /** Weighted score 0-100; null for the not-assessed pillar. */
  score: number | null;
  status: "strength" | "watch" | "leak" | "not_assessed";
  context: Array<{ label: string; value: string }>;
  components: DiagnosticScoreComponent[];
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
    /** Job penetration: share of reviewed jobs that included each service. */
    mix: Array<{
      name: string;
      jobs: number;
      penetrationPct: number;
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
  framework: DiagnosticPillar[];
  leaks: DiagnosticLeak[];
}

const PillarCodeSchema = z.enum(["S", "N", "I", "P", "E"]);

/**
 * Model output. The model narrates and ranks catalog leaks; it never supplies
 * numbers or scores. Exposure always comes from `DiagnosticFacts.leaks` and
 * scores always come from `DiagnosticFacts.framework`.
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
  frameworkNotes: z
    .array(
      z.object({
        pillar: PillarCodeSchema,
        assessment: z.string().min(1).max(420),
        commercialImplication: z.string().min(1).max(420),
        strengthOpportunity: z.string().min(1).max(340),
      }),
    )
    .length(5),
  keyConstraints: z
    .array(
      z.object({
        pillar: PillarCodeSchema,
        title: z.string().min(1).max(140),
        whatItMeans: z.string().min(1).max(420),
        metricRef: z.string().min(1).max(120),
      }),
    )
    .min(1)
    .max(4),
  strengths: z
    .array(
      z.object({
        pillar: PillarCodeSchema,
        title: z.string().min(1).max(140),
        detail: z.string().min(1).max(380),
        metricRef: z.string().min(1).max(120),
      }),
    )
    .max(4),
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
        what: z.string().min(1).max(280),
        when: z.string().min(1).max(100),
        how: z.string().min(1).max(340),
        effortHours: z.number().min(0).max(40),
        metricRef: z.string().min(1).max(120),
      }),
    )
    .min(1)
    .max(5),
  thirtyDayPlan: z
    .array(
      z.object({
        window: z.enum(["Days 1-7", "Days 8-21", "Days 22-30"]),
        focus: z.string().min(1).max(180),
        actions: z
          .array(
            z.object({
              what: z.string().min(1).max(240),
              when: z.string().min(1).max(100),
              how: z.string().min(1).max(360),
              ownerRole: z.string().min(1).max(100),
              successMetric: z.string().min(1).max(180),
            }),
          )
          .min(1)
          .max(4),
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
