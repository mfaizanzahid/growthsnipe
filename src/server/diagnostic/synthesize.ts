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
  "- Follow the five SNIPE pillars: S Size the Gap, N Net-Ticket Architecture, I Instant Capture, P Pipeline Engine, E Expand and Evaluate.",
  "- Framework scores are calculated in the backend. Never propose, change, or restate a score. Explain what the score and evidence mean.",
  "- Instant Capture is not assessed in Release 1. Never mention response times, missed calls, missed leads, answer rates, or call handling as a finding.",
  "- Every recommendation must state what to do, when to do it, and how to do it.",
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
    "5. Explain each of the five pillars in facts.framework, using the backend score and the evidence. For S, N, P, and E write: what the numbers say, the commercial implication, and a strength or opportunity. For I write that Instant Capture is not assessed in Release 1 because no phone, lead, or CRM data is connected. Do not invent response-time or missed-lead findings.",
    "6. Identify 1 to 4 key constraints and up to 4 strengths. Cite a metricRef for each.",
    "7. Write 3 to 5 quick wins for the next 14 days. Each must state what to do, when to do it, and how to do it.",
    "8. Write a 30-day plan with exactly three windows: Days 1-7, Days 8-21, Days 22-30. Each action must state what to do, when to do it, how to do it, the owner role, and the success metric.",
    "9. In nextStep, recommend one of these exact values (no trademark): DIY, SNIPE Loops, SNIPE Blueprint, SNIPE Engine Core, SNIPE Engine Command, and explain why using the facts. Set creditNote to: 'The SNIPE Diagnostic™ fee is credited toward a SNIPE Blueprint™ purchased within 14 days of your readout.'",
    "10. In methodology, list sources (the provider and the 12-month window), the assumptions you used, and a short no-guarantee disclaimer.",
    "",
    "Return JSON with this exact shape:",
    JSON.stringify(
      {
        snapshot: { headline: "", summary: "", scoreRationale: "" },
        executiveSummary: { paragraphs: [""], topFindings: [{ title: "", metricRef: "", oneLine: "" }] },
        frameworkNotes: [
          { pillar: "S", assessment: "", commercialImplication: "", strengthOpportunity: "" },
          { pillar: "N", assessment: "", commercialImplication: "", strengthOpportunity: "" },
          {
            pillar: "I",
            assessment: "Instant Capture is not assessed in Release 1 because no phone, lead, or CRM data is connected.",
            commercialImplication: "No capture performance claim is made because that data is not connected.",
            strengthOpportunity: "Connect phone, lead, and CRM data in a later release to assess capture.",
          },
          { pillar: "P", assessment: "", commercialImplication: "", strengthOpportunity: "" },
          { pillar: "E", assessment: "", commercialImplication: "", strengthOpportunity: "" },
        ],
        keyConstraints: [{ pillar: "S", title: "", whatItMeans: "", metricRef: "" }],
        strengths: [{ pillar: "N", title: "", detail: "", metricRef: "" }],
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
        quickWins: [{ title: "", what: "", when: "", how: "", effortHours: 2, metricRef: "" }],
        thirtyDayPlan: [
          {
            window: "Days 1-7",
            focus: "",
            actions: [{ what: "", when: "", how: "", ownerRole: "", successMetric: "" }],
          },
          {
            window: "Days 8-21",
            focus: "",
            actions: [{ what: "", when: "", how: "", ownerRole: "", successMetric: "" }],
          },
          {
            window: "Days 22-30",
            focus: "",
            actions: [{ what: "", when: "", how: "", ownerRole: "", successMetric: "" }],
          },
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

function normalizeNarrativeInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const copy = { ...(raw as Record<string, unknown>) };
  const nextStep = copy.nextStep;
  if (nextStep && typeof nextStep === "object" && !Array.isArray(nextStep)) {
    const normalized = { ...(nextStep as Record<string, unknown>) };
    if (typeof normalized.recommendation === "string") {
      const value = normalized.recommendation.replace(/™/g, "").trim();
      if (/blueprint/i.test(value)) normalized.recommendation = "SNIPE Blueprint";
      else if (/engine\s*core/i.test(value)) normalized.recommendation = "SNIPE Engine Core";
      else if (/engine\s*command/i.test(value)) normalized.recommendation = "SNIPE Engine Command";
      else if (/loops/i.test(value)) normalized.recommendation = "SNIPE Loops";
      else if (/^diy$/i.test(value)) normalized.recommendation = "DIY";
    }
    copy.nextStep = normalized;
  }
  return copy;
}

export function validateNarrative(facts: DiagnosticFacts, raw: unknown): NarrativeValidation {
  const parsed = DiagnosticNarrativeSchema.safeParse(normalizeNarrativeInput(raw));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 8) };
  }
  const narrative = parsed.data;
  // The model sometimes reports a sub-hour estimate as 0; show a sane minimum.
  for (const win of narrative.quickWins) {
    if (win.effortHours < 1) win.effortHours = 1;
  }
  const errors: string[] = [];
  const leakIds = new Set(facts.leaks.map((leak) => leak.id));
  for (const leak of narrative.leakNarratives) {
    if (!leakIds.has(leak.leakId)) errors.push(`unknown leakId: ${leak.leakId}`);
  }
  const expectedPillars = ["S", "N", "I", "P", "E"] as const;
  const seenPillars = new Set(narrative.frameworkNotes.map((note) => note.pillar));
  for (const pillar of expectedPillars) {
    if (!seenPillars.has(pillar)) errors.push(`missing framework pillar: ${pillar}`);
  }
  if (seenPillars.size !== narrative.frameworkNotes.length) {
    errors.push("frameworkNotes must cover each pillar exactly once");
  }
  const instantCapture = narrative.frameworkNotes.find((note) => note.pillar === "I");
  if (instantCapture) {
    const text = `${instantCapture.assessment} ${instantCapture.commercialImplication} ${instantCapture.strengthOpportunity}`;
    if (!/not assessed/i.test(text)) errors.push("Instant Capture must say it is not assessed");
    if (/response[\s-]?time|missed[\s-]?call|missed[\s-]?lead|answer[\s-]?rate|call[\s-]?handling|speed[\s-]?to[\s-]?lead/i.test(text)) {
      errors.push("Instant Capture must not claim response-time or missed-lead findings");
    }
  }
  const windows = narrative.thirtyDayPlan.map((phase) => phase.window);
  if (windows.join("|") !== "Days 1-7|Days 8-21|Days 22-30") {
    errors.push("thirtyDayPlan windows must be Days 1-7, Days 8-21, Days 22-30 in order");
  }
  const refs = [
    ...narrative.executiveSummary.topFindings.map((f) => f.metricRef),
    ...narrative.quickWins.map((w) => w.metricRef),
    ...narrative.keyConstraints.map((c) => c.metricRef),
    ...narrative.strengths.map((s) => s.metricRef),
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
      // Reasoning models spend completion tokens on reasoning before emitting
      // the JSON. 3,500 was fully consumed by reasoning and returned no content.
      max_completion_tokens: 16000,
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(`AI synthesis failed: ${r.status}`);
  const j = (await r.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: unknown;
  };
  const text = j.choices?.map((c) => c.message?.content).filter((v): v is string => !!v).join("\n") ?? "";
  if (text.trim() === "") {
    console.error(
      "[diagnostic] empty OpenAI response:",
      JSON.stringify({ finish: j.choices?.[0]?.finish_reason, usage: j.usage }),
    );
    throw new Error("AI synthesis returned an empty response");
  }
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
      max_tokens: 8000,
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
  console.error("[diagnostic] AI narrative failed validation:", lastErrors.join(" | "));
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
    "The next step is to concentrate on the highest-ranked finding first, then use the 30-day plan to keep the work moving.",
  ];
  return {
    snapshot: {
      headline: top ? `${cap(top.title)}` : "A clear view of the last 12 months",
      summary: `A 12-month review of ${facts.baseline.jobs} jobs, ${facts.baseline.cancelled} cancellations, and ${money(facts.baseline.revenueMinor, facts.meta.currency)} in completed revenue.`,
      scoreRationale:
        "Pillar scores are calculated from the connected business data using fixed backend rules. The appendix lists each rule.",
    },
    executiveSummary: {
      paragraphs,
      topFindings: leaks.map((leak) => ({
        title: leak.title,
        metricRef: leak.evidence[0]?.metricRef ?? "baseline.jobs",
        oneLine: leak.evidence[0] ? `${leak.evidence[0].value}` : "See the leak map for evidence.",
      })).slice(0, 3),
    },
    frameworkNotes: facts.framework.map((pillar) => ({
      pillar: pillar.code,
      assessment: pillarAssessment(pillar),
      commercialImplication: pillarImplication(pillar),
      strengthOpportunity: pillarOpportunity(pillar),
    })),
    keyConstraints: leaks.slice(0, 4).map((leak) => ({
      pillar: leak.pillar,
      title: leak.title,
      whatItMeans: leakConsequence(leak),
      metricRef: leak.evidence[0]?.metricRef ?? "baseline.jobs",
    })),
    strengths: facts.framework
      .filter((pillar) => pillar.status === "strength" || pillar.status === "watch")
      .slice(0, 4)
      .map((pillar) => ({
        pillar: pillar.code,
        title: `${pillar.name} is a relative strength`,
        detail: pillarAssessment(pillar),
        metricRef: pillarRef(pillar.code),
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
      what: leakFix(leak),
      when: "This week",
      how: leakFix(leak),
      effortHours: 4,
      metricRef: leak.evidence[0]?.metricRef ?? "baseline.jobs",
    })),
    thirtyDayPlan: [
      {
        window: "Days 1-7",
        focus: "Fix the highest-ranked leak first",
        actions: [
          {
            what: leaks[0] ? leakFix(leaks[0]) : "Confirm the current booking process.",
            when: "Days 1-7",
            how: "Assign one owner, write the new step down, and use it on every new job.",
            ownerRole: "Owner",
            successMetric: "The change is live and visible on every new job.",
          },
        ],
      },
      {
        window: "Days 8-21",
        focus: "Make the change consistent",
        actions: [
          {
            what: "Apply the change to every job and every team member.",
            when: "Days 8-21",
            how: "Add the step to the booking checklist and review it in the weekly team meeting.",
            ownerRole: "Operations lead",
            successMetric: "The change is used on 100% of new jobs.",
          },
        ],
      },
      {
        window: "Days 22-30",
        focus: "Measure and adjust",
        actions: [
          {
            what: "Compare the metric to the 12-month baseline and adjust the process.",
            when: "Days 22-30",
            how: "Pull the same report, compare the number, and document one adjustment.",
            ownerRole: "Owner",
            successMetric: "The target metric moves in the intended direction.",
          },
        ],
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

function pillarAssessment(pillar: DiagnosticFacts["framework"][number]): string {
  if (pillar.code === "I") {
    return "Instant Capture is not assessed in Release 1 because no phone, lead, or CRM data is connected.";
  }
  if (pillar.score === null) {
    return `${pillar.name} could not be scored from the available records.`;
  }
  const band =
    pillar.status === "strength"
      ? "a relative strength"
      : pillar.status === "watch"
        ? "a watch area"
        : "the clearest constraint";
  const context = pillar.context.slice(0, 3).map((item) => `${item.label}: ${item.value}`).join("; ");
  return `${pillar.name} scores ${pillar.score} of 100, ${band}. ${context}.`;
}

function pillarImplication(pillar: DiagnosticFacts["framework"][number]): string {
  if (pillar.code === "I") {
    return "No capture performance claim is made because that data is not connected.";
  }
  if (pillar.status === "leak") {
    return "This is likely holding back revenue or margin and should be addressed in the next 30 days.";
  }
  if (pillar.status === "watch") {
    return "This area has room to improve and should be watched while the priority fixes are made.";
  }
  return "This area is supporting current performance and should be protected.";
}

function pillarOpportunity(pillar: DiagnosticFacts["framework"][number]): string {
  if (pillar.code === "I") {
    return "Connect phone, lead, and CRM data in a later release to assess capture.";
  }
  if (pillar.status === "strength") {
    return "Keep the current process and use it as the standard for other areas.";
  }
  return "A focused improvement here would strengthen the overall system.";
}

function pillarRef(code: DiagnosticFacts["framework"][number]["code"]): string {
  switch (code) {
    case "S":
      return "baseline.revenueMinor";
    case "N":
      return "services.addOnAttachPct";
    case "P":
      return "referrals.activeAgentCount";
    case "E":
      return "clients.repeatClientSharePct";
    default:
      return "baseline.jobs";
  }
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
