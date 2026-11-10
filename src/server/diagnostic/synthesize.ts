import type { Env } from "../types";
import { DiagnosticNarrativeSchema, type DiagnosticFacts, type DiagnosticNarrative } from "./types";
import { metricValue } from "./facts";

const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";

const SYSTEM_PROMPT = [
  "You are the lead growth analyst at GrowthSnipe writing a paid SNIPE Diagnostic report for the owner of a home-service business.",
  "",
  "You are given FACTS computed from the business's booking software. FACTS are the only source of numbers, names, dates, and trends. Treat them as read-only ground truth.",
  "",
  "Hard rules:",
  "- Never invent, estimate, recompute, or round a number. Copy figures exactly as given.",
  "- Reference metrics only by their metricRef. Every metricRef you cite must exist in FACTS.",
  "- Use only leak ids that exist in facts.leaks. Do not create new leaks or new dollar figures.",
  "- Do not create dollar exposure. Exposure always comes from facts.leaks; you never restate or change it.",
  "- Do not compare to industry benchmarks.",
  "- No guarantees of revenue, rankings, or outcomes.",
  "- Write for a smart owner at an 8th-grade reading level. Short sentences. Second person. Direct, calm, concrete.",
  "- No em dashes. Use commas, periods, or colons.",
  "- No jargon, hype, filler, or praise. Prefer one specific next action over general advice.",
  "- Never write internal metric identifiers or data field names in the prose. Describe measures the way an owner would say them.",
  "- Write product names exactly as: SNIPE Diagnostic™, SNIPE Blueprint™, SNIPE Engine™ Core, SNIPE Engine™ Command, SNIPE Loops™.",
  "- Return ONLY valid JSON. No markdown, no commentary, no code fences.",
].join("\n");

function userPrompt(facts: DiagnosticFacts): string {
  return [
    `BUSINESS: ${facts.meta.businessName ?? "the business"} (${facts.meta.trade ?? "home services"})`,
    `PROVIDER: ${facts.meta.provider}`,
    `WINDOW: ${facts.meta.periodLabel}`,
    `CURRENCY: ${facts.meta.currency}`,
    "",
    "FACTS (read-only, do not alter):",
    JSON.stringify(facts, null, 2),
    "",
    "TASKS:",
    "1. From facts.leaks, select the 3 to 6 most material leaks.",
    "2. Rank them by likely impact and practical effort, using priorityRank 1 as the highest priority.",
    "3. For each selected leak, write: a short title, the likely business consequence, the recommended fix, effort, and confidence. Cite evidence with metricRef and the exact value string found in the leak.",
    "4. Write a snapshot (headline, summary, score rationale) and an executive summary of one to three short paragraphs with up to three top findings.",
    "5. Write a short note for each scorecard dimension in FACTS.",
    "6. Write 3 to 5 quick wins for the next 14 days, and a 90-day plan with exactly three windows: Days 1-14, Days 15-45, Days 46-90.",
    "7. In nextStep, recommend one of: DIY, SNIPE Loops, SNIPE Blueprint, SNIPE Engine Core, SNIPE Engine Command, and explain why using the facts. Set creditNote to: 'The SNIPE Diagnostic™ fee is credited toward a SNIPE Blueprint™ purchased within 14 days of your readout.'",
    "8. In methodology, list sources (the provider and the 12-month window), the assumptions you used, and a short no-guarantee disclaimer.",
    "",
    "Return JSON with this exact shape:",
    JSON.stringify(
      {
        snapshot: { headline: "", summary: "", scoreRationale: "" },
        executiveSummary: { paragraphs: [""], topFindings: [{ title: "", metricRef: "", oneLine: "" }] },
        scorecardNotes: [{ dimension: "demand", note: "" }],
        leakNarratives: [
          {
            leakId: "",
            title: "",
            severity: "high",
            confidence: "medium",
            consequence: "",
            recommendedFix: "",
            effort: "medium",
            priorityRank: 1,
          },
        ],
        quickWins: [{ title: "", action: "", effortHours: 2, metricRef: "" }],
        ninetyDayPlan: [
          { window: "Days 1-14", focus: "", actions: [""], successMetric: "" },
          { window: "Days 15-45", focus: "", actions: [""], successMetric: "" },
          { window: "Days 46-90", focus: "", actions: [""], successMetric: "" },
        ],
        nextStep: { recommendation: "SNIPE Blueprint", rationale: "", creditNote: "" },
        methodology: { sources: [""], assumptions: [""], disclaimers: [""] },
      },
      null,
      2,
    ),
  ].join("\n");
}

export interface NarrativeValidation {
  ok: boolean;
  errors: string[];
  narrative?: DiagnosticNarrative;
}

export function validateNarrative(facts: DiagnosticFacts, raw: unknown): NarrativeValidation {
  const parsed = DiagnosticNarrativeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 8) };
  }
  const narrative = parsed.data;
  const errors: string[] = [];
  const leakIds = new Set(facts.leaks.map((leak) => leak.id));
  for (const leak of narrative.leakNarratives) {
    if (!leakIds.has(leak.leakId)) errors.push(`unknown leakId: ${leak.leakId}`);
  }
  const refs = [
    ...narrative.executiveSummary.topFindings.map((f) => f.metricRef),
    ...narrative.quickWins.map((w) => w.metricRef),
    ...facts.leaks.flatMap((leak) => leak.evidence.map((e) => e.metricRef)),
  ];
  for (const ref of refs) {
    if (metricValue(facts, ref) === undefined) errors.push(`unknown metricRef: ${ref}`);
  }
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 8) };
  return { ok: true, errors: [], narrative };
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

async function callOpenAi(env: Env, user: string): Promise<string> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.AI_MODEL ?? DEFAULT_OPENAI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
      max_completion_tokens: 3500,
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(`AI synthesis failed: ${r.status}`);
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = j.choices?.map((c) => c.message?.content).filter((v): v is string => !!v).join("\n") ?? "";
  if (text.trim() === "") throw new Error("AI synthesis returned an empty response");
  return text;
}

async function callAnthropic(env: Env, user: string): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 3500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) throw new Error(`AI synthesis failed: ${r.status}`);
  const j = (await r.json()) as { content?: Array<{ text?: string }> };
  const text = j.content?.map((p) => p.text).filter((v): v is string => !!v).join("\n") ?? "";
  if (text.trim() === "") throw new Error("AI synthesis returned an empty response");
  return text;
}

/**
 * Turn verified facts into a structured narrative. The model never supplies a
 * number or an exposure figure; both are validated against the facts.
 */
export async function synthesizeDiagnostic(env: Env, facts: DiagnosticFacts): Promise<DiagnosticNarrative> {
  const provider = (env.AI_PROVIDER ?? "").toLowerCase();
  const configured =
    provider === "openai" ? !!env.OPENAI_API_KEY : !!env.ANTHROPIC_API_KEY;
  if (!configured) return fallbackNarrative(facts);

  let lastErrors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const base = userPrompt(facts);
    const user = attempt === 0
      ? base
      : `${base}\n\nYour previous response was invalid:\n- ${lastErrors.join("\n- ")}\nReturn corrected JSON only.`;
    let text: string;
    try {
      text = provider === "openai" ? await callOpenAi(env, user) : await callAnthropic(env, user);
    } catch (err) {
      lastErrors = [err instanceof Error ? err.message : String(err)];
      continue;
    }
    const validation = validateNarrative(facts, parseJson(text));
    if (validation.ok && validation.narrative) return validation.narrative;
    lastErrors = validation.errors;
  }
  return fallbackNarrative(facts);
}

/** Deterministic narrative used when AI is unavailable or keeps failing. */
export function fallbackNarrative(facts: DiagnosticFacts): DiagnosticNarrative {
  const leaks = facts.leaks.slice(0, 3);
  const top = leaks[0];
  const paragraphs = [
    `${facts.meta.businessName ?? "The business"} completed ${facts.baseline.completed} jobs and booked ${money(facts.baseline.revenueMinor, facts.meta.currency)} over the last 12 months. Average ticket is ${money(facts.baseline.avgTicketMinor, facts.meta.currency)}.`,
    top
      ? `The most material finding is ${top.title.toLowerCase()}. ${leakConsequence(top)}`
      : "No material leak was detected in the measurable data.",
    "The next step is to concentrate on the highest-ranked finding first, then use the 90-day plan to keep the work moving.",
  ];
  return {
    snapshot: {
      headline: top ? `${cap(top.title)}` : "A clear view of the last 12 months",
      summary: `A 12-month review of ${facts.baseline.jobs} jobs, ${facts.baseline.cancelled} cancellations, and ${money(facts.baseline.revenueMinor, facts.meta.currency)} in completed revenue.`,
      scoreRationale: "Scorecard values are calculated directly from the connected business data.",
    },
    executiveSummary: {
      paragraphs,
      topFindings: leaks.map((leak) => ({
        title: leak.title,
        metricRef: leak.evidence[0]?.metricRef ?? "baseline.jobs",
        oneLine: leak.evidence[0] ? `${leak.evidence[0].value}` : "See the leak map for evidence.",
      })).slice(0, 3),
    },
    scorecardNotes: facts.scorecard.map((entry) => ({
      dimension: entry.dimension,
      note: scoreNote(entry.score, entry.status),
    })),
    leakNarratives: leaks.map((leak, index) => ({
      leakId: leak.id,
      title: leak.title,
      severity: index === 0 ? "high" : index === 1 ? "medium" : "low",
      confidence: leak.quantifiable ? "high" : "medium",
      consequence: leakConsequence(leak),
      recommendedFix: leakFix(leak),
      effort: index === 0 ? "medium" : "low",
      priorityRank: index + 1,
    })),
    quickWins: leaks.slice(0, 3).map((leak) => ({
      title: leak.title,
      action: leakFix(leak),
      effortHours: 4,
      metricRef: leak.evidence[0]?.metricRef ?? "baseline.jobs",
    })),
    ninetyDayPlan: [
      {
        window: "Days 1-14",
        focus: "Fix the highest-ranked leak first",
        actions: [leaks[0] ? leakFix(leaks[0]) : "Confirm the current booking process."],
        successMetric: "A written process change with an owner and a review date.",
      },
      {
        window: "Days 15-45",
        focus: "Make the change consistent",
        actions: ["Apply the change to every job and every team member."],
        successMetric: "The change is used on 100% of new jobs.",
      },
      {
        window: "Days 46-90",
        focus: "Measure and adjust",
        actions: ["Compare the metric to the 12-month baseline and adjust the process."],
        successMetric: "The target metric moves in the intended direction.",
      },
    ],
    nextStep: {
      recommendation: "SNIPE Blueprint",
      rationale: "A Blueprint turns the findings into a 12-month plan with targets, channel mix, workflows, and priorities.",
      creditNote: "The SNIPE Diagnostic™ fee is credited toward a SNIPE Blueprint™ purchased within 14 days of your readout.",
    },
    methodology: {
      sources: [`${facts.meta.provider} order data, ${facts.meta.periodLabel}`],
      assumptions: leaks.flatMap((leak) => leak.exposure?.assumptions ?? []),
      disclaimers: ["This report is an analysis of available data, not a guarantee of future results."],
    },
  };
}

function money(minor: number | null, currency: string): string {
  if (minor === null) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function scoreNote(score: number, status: string): string {
  if (status === "unknown") return "Not enough consistent data to score this area.";
  if (status === "strength") return `Scored ${score}. This area is a relative strength in the reviewed data.`;
  if (status === "watch") return `Scored ${score}. This area deserves attention before it becomes a bigger constraint.`;
  return `Scored ${score}. This area is the clearest source of lost opportunity.`;
}

function leakConsequence(leak: DiagnosticFacts["leaks"][number]): string {
  if (leak.exposure) {
    return `${leak.exposure.method}. The modeled exposure is a range, and the assumptions are shown in the appendix.`;
  }
  return "The data shows a pattern worth correcting even where a precise dollar range cannot be supported.";
}

function leakFix(leak: DiagnosticFacts["leaks"][number]): string {
  switch (leak.category) {
    case "cancellation":
      return "Confirm every booking quickly, send a reminder before the job, and follow up the same day when a job cancels.";
    case "ticket":
      return "Define a standard add-on offer and attach it to every eligible job.";
    case "referral":
      return "Add two new referral partners to the pipeline and set a monthly check-in with your top partners.";
    case "demand":
      return "Reconnect with dormant partners and ask what changed in their referral flow.";
    case "repeat":
      return "Build a simple follow-up cadence so each partner hears from you after every job.";
    case "capacity":
      return "Review the schedule against real demand and protect capacity for the highest-value work.";
    default:
      return "Assign one owner, one metric, and one review date to the finding.";
  }
}
