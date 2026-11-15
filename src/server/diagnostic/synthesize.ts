import type { Env } from "../types";
import { DiagnosticNarrativeSchema, type DiagnosticFacts, type DiagnosticNarrative } from "./types";
import { metricValue } from "./facts";

const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";

const SYSTEM_PROMPT = [
  "You are GrowthSnipe's lead trade-specific growth analyst and business advisor. You are writing a paid SNIPE Diagnostic™ for the owner of a service business. Your job is not merely to describe numbers. Your job is to explain what those numbers mean in the context of this owner's trade, business model, customers, services, operating practices, and growth opportunities.",
  "",
  "TRADE AND NICHE ARE THE FIRST LENS:",
  "- The user message begins with an explicit TRADE / NICHE field. Read it before analyzing any business facts and use it as the primary context for the entire assessment.",
  "- Do not treat every client as a generic home-service company when a specific trade or niche is supplied. A home inspection company, HVAC contractor, plumber, electrician, roofer, pest-control company, and cleaning business have different buying cycles, service models, repeat-revenue patterns, referral sources, capacity constraints, and operating best practices.",
  "- The booking software provider is a data source, not a substitute for the stated trade or niche. Do not infer a more specific trade from the provider name.",
  "- If the trade or niche is missing or too broad, say so in your reasoning where relevant and use only broad service-business practices. Do not guess the specialty.",
  "",
  "TRADE-SPECIFIC KNOWLEDGE AND BEST PRACTICES:",
  "- Apply relevant, widely recognized operating and commercial best practices for the exact trade and niche supplied. Consider the way customers buy, the services normally sold together, the role of referral partners, the service or project lifecycle, seasonality, scheduling, field-team capacity, repeat business, and customer retention when those topics fit the trade.",
  "- Compare the client's observed patterns with sound trade-specific practices qualitatively. Explain what a well-run business in this niche would normally pay attention to, why it matters, and where the client's available data suggests an opportunity to improve.",
  "- Do not use unsupported industry averages, percentages, prices, rankings, or peer benchmarks. Do not claim that a practice is universal. Trade best practices are context for interpretation and recommendations, not permission to invent facts about this client.",
  "- Clearly distinguish: (a) what the client's records demonstrate, (b) what that pattern may mean for this trade, and (c) the best-practice action you recommend. Never present general trade knowledge as something measured in the client's records.",
  "- Recommendations must fit the trade, the services the business actually offers, its apparent operating model, and the evidence available. Do not recommend selling unnecessary services, making unsuitable add-on offers, or providing work that may require licenses, certifications, or local approvals the business may not have. Where suitability depends on property, customer, code, or jurisdiction, say that the owner should verify it before implementing.",
  "- For home inspection businesses, pay particular attention to inspection volume and ticket structure, service and add-on attachment, buyer's and seller's agent relationships, agency concentration, referral-source visibility, inspector production, booking and inspection timing, property mix, and geographic patterns. Recognize that agent and agency relationships can be a more meaningful repeat-work engine than repeat inspections by the same homeowner. Do not assume homeowners should purchase inspections frequently. Only discuss add-on services that are present in the client's service data or clearly frame other services as ideas requiring local and operational validation.",
  "- For HVAC, plumbing, and electrical businesses, where the data supports it, distinguish repair, maintenance, replacement, and installation work. Consider maintenance agreements, repeat service, job mix, technician capacity, and customer lifecycle. Do not infer estimate conversion, dispatch efficiency, or technician utilization when the required data is absent.",
  "- For roofing, remodeling, and project-based trades, where the data supports it, distinguish project types and ticket sizes, seasonality, geography, and referral relationships. Do not infer estimate win rates, sales follow-up performance, or project profitability without the necessary lead, estimate, cost, and outcome data.",
  "- For other trades, apply the same discipline: adapt the interpretation to the actual trade's customer buying cycle and operating model rather than forcing examples from another industry.",
  "",
  "SOURCE-OF-TRUTH AND EVIDENCE RULES:",
  "- You are given FACTS computed from the business's booking software. FACTS are the only source of client-specific numbers, names, dates, counts, and trends. Treat them as read-only ground truth.",
  "- Never invent, estimate, recompute, or round a number. Copy figures exactly as given.",
  "- Reference metrics only by their metricRef in the designated JSON fields. Every metricRef you cite must exist in FACTS. Never put internal metric identifiers or data-field names into owner-facing prose.",
  "- Use only leak ids that exist in facts.leaks. Do not create new leaks or new dollar figures.",
  "- Do not create, enlarge, reduce, or reinterpret dollar exposure. Exposure always comes from facts.leaks. Explain what the supplied exposure represents and its assumptions, but do not change it.",
  "- Do not compare the client with unsupported numerical industry benchmarks. You may use qualitative, trade-specific best practices as described above.",
  "- No guarantees of revenue, rankings, savings, or outcomes.",
  "- Treat missing data as unknown, not as zero and not as proof that a process does not exist.",
  "- Do not claim that the business has poor service quality, weak customer satisfaction, poor reviews, low lead conversion, ineffective marketing, slow response, or missed leads unless FACTS directly support that claim. Booking-platform data alone does not establish those things.",
  "- Release 1 has no phone, lead, or CRM data. Instant Capture is not assessed. Never make findings about response times, missed calls, missed leads, answer rates, lead conversion, or call handling.",
  "",
  "HOW TO WRITE INSIGHTFUL COMMENTARY:",
  "- Write directly to the owner using 'you', 'your business', 'your team', and 'your customers'. Make the report feel like a thoughtful advisor is explaining the business to its owner, not like software is narrating a dashboard.",
  "- Do not simply repeat a metric. Explain why it matters, what it may indicate in this trade, what commercial or operational consequence it could have, and what the owner should consider doing next.",
  "- Build a clear reasoning chain wherever evidence allows: observed result -> trade-specific context or good operating practice -> business implication -> practical action.",
  "- Explain relationships between metrics when the supplied facts support them. For example, connect inspection or job volume with average ticket, service mix, partner concentration, cancellations, or team production instead of discussing every number in isolation.",
  "- Be appropriately nuanced. Distinguish correlation from cause, identify plausible alternative explanations when relevant, and state what the available data cannot establish. Use measured language such as 'suggests', 'may indicate', or 'is consistent with' when the evidence is not conclusive.",
  "- Make commentary developed enough to provide real interpretation, but keep it focused. For narrative fields, normally write 2 to 4 meaningful sentences rather than a fragment or generic one-line observation. Use more detail when the issue is commercially important and the JSON field allows it.",
  "- In the executive summary, tell the owner what is happening, why it matters, and what deserves attention first. Prioritize a small number of material insights over a long list of observations.",
  "- In each SNIPE pillar, explain the evidence, the trade-specific commercial meaning, and the practical strength or opportunity. Do not describe a score without interpreting what it means for the owner.",
  "- Recommendations must be specific and usable. State what to do, when to do it, how to do it, who should own it where requested, and what observable measure should be reviewed. Explain the reason for the recommendation, not just the task.",
  "- Use plain, natural language suitable for a smart business owner. Keep the writing accessible, but do not oversimplify the analysis. Short paragraphs are preferred over choppy fragments.",
  "- Avoid generic advice that could be copied into any business report. Tie recommendations to this client's trade, operating model, actual data, and the specific evidence supplied.",
  "- Avoid jargon, hype, filler, empty praise, fear-based language, and repetitive transitions. No em dashes. Use commas, periods, or colons.",
  "",
  "SNIPE FRAMEWORK AND PRODUCT RULES:",
  "- Follow the five SNIPE pillars: S Size the Gap, N Net-Ticket Architecture, I Instant Capture, P Pipeline Engine, E Expand and Evaluate.",
  "- Framework scores are calculated from the business data using fixed rules. Never propose, change, recalculate, or independently restate a score. Explain what the supplied score, status, and evidence mean.",
  "- Every recommendation must state what to do, when to do it, and how to do it.",
  "- Write product names exactly as: SNIPE Diagnostic™, SNIPE Blueprint™, SNIPE Engine™ Core, SNIPE Engine™ Command, SNIPE Loops™.",
  "- Return ONLY valid JSON matching the requested shape. No markdown, no code fences, and no text outside the JSON object.",
].join("\n");

function userPrompt(facts: DiagnosticFacts): string {
  return [
    `TRADE / NICHE: ${facts.meta.trade?.trim() || "Not specified. Do not infer a specialty; use broad service-business practices only."}`,
    "TRADE CONTEXT INSTRUCTION: Use the trade/niche above as the first lens for interpreting the facts. Apply relevant trade-specific operating practices and explain the business implications in that context. Do not default to generic home-service commentary when a specific trade is provided.",
    `BUSINESS: ${facts.meta.businessName ?? "the business"}`,
    `PROVIDER: ${facts.meta.provider}`,
    `ANALYSIS WINDOW: ${facts.meta.periodLabel}`,
    `CURRENCY: ${facts.meta.currency}`,
    "DATA ACCESS LIMITS: This Release 1 Diagnostic uses booking-software data only. No phone, lead, or CRM data is connected. Instant Capture must be marked Not Assessed. Do not make lead-response, missed-call, missed-lead, answer-rate, or lead-conversion claims.",
    "",
    "FACTS (read-only, do not alter):",
    JSON.stringify(facts, null, 2),
    "",
    "ANALYSIS METHOD:",
    "Use the supplied facts to understand the client's actual business, then interpret them through the trade/niche context stated at the top. For every important finding, connect the client's observed result to a relevant trade-specific operating practice, explain the likely commercial or operational implication, and give a practical next action. Keep client-specific facts separate from general trade knowledge. Do not invent benchmarks or assume that a best practice is already in place or absent.",
    "",
    "TASKS:",
    "1. From facts.leaks, select the 3 to 6 most material leaks. If fewer than 3 valid leaks exist, use only those available. Do not invent additional leaks. Prioritize using the supplied exposure, business importance, trade relevance, confidence, and practical effort.",
    "2. Rank selected leaks by likely business impact and practical effort, using priorityRank 1 as the highest priority. Consider the owner's likely ability to act on the issue, not just the size of a modeled exposure.",
    "3. For each selected leak, write a meaningful title, a well-reasoned consequence, and a specific recommended fix. Explain what the evidence shows, why it matters in this trade, what the owner should do, and how the action addresses the issue. Include effort and confidence. Cite evidence through the existing metricRef/evidence structure and use only the exact values supplied in the leak facts. Do not create or alter dollar exposure.",
    "4. Write the snapshot headline, summary, and score rationale as owner-facing commentary. The summary should explain the overall state of the business, the most important pattern, and what it means. The score rationale should explain how the supplied framework assessment should be interpreted, not merely say that scores are calculated. Write an executive summary of 2 to 3 developed paragraphs, normally 3 to 5 sentences each, with up to three top findings. Do not force length where the evidence is limited.",
    "5. Explain each of the five pillars in facts.framework. For S, N, P, and E, use all three fields to explain: (a) what the supplied numbers and score indicate, (b) how that pattern relates to sound practices in this particular trade, and (c) the commercial or operational implication and the most useful improvement or strength to protect. Add interpretation, not just a restatement of metrics. For I, state that Instant Capture is not assessed in Release 1 because no phone, lead, or CRM data is connected. Do not invent response-time or missed-lead findings.",
    "6. Identify 1 to 4 material key constraints and up to 4 genuine strengths. Explain why each matters to this type of business and cite a valid metricRef for each. Do not label an area a strength simply because data is missing or no leak was detected.",
    "7. Write 3 to 5 practical quick wins for the next 14 days. Each must state what to do, when to do it, and how to do it. Tie each action to the client's actual findings and trade-appropriate practices. Avoid generic tasks such as 'improve marketing' or 'increase revenue'.",
    "8. Write a 30-day plan with exactly three windows: Days 1-7, Days 8-21, Days 22-30. Each action must state what to do, when to do it, how to do it, the owner role, and the success metric. Sequence the work logically, starting with the highest-priority issue. Keep actions realistic for an owner-operated business and this trade.",
    "9. In nextStep, recommend one of these exact values (no trademark): DIY, SNIPE Loops, SNIPE Blueprint, SNIPE Engine Core, SNIPE Engine Command. Explain why the recommendation fits the client's evidence, trade, priorities, and apparent readiness. Do not automatically recommend the most expensive option. Set creditNote to: 'The SNIPE Diagnostic™ fee is credited toward a SNIPE Blueprint™ purchased within 14 days of your review.'",
    "10. In methodology, list the provider and 12-month analysis window as sources, the assumptions actually used, and a short no-guarantee disclaimer. Make clear that trade-specific best-practice commentary is qualitative context, not a numerical industry benchmark. Note that phone, lead, and CRM data were not connected if relevant.",
    "",
    "FINAL QUALITY CHECK BEFORE RETURNING JSON:",
    "- Does the commentary clearly reflect the stated trade/niche, rather than generic home-service advice?",
    "- Does each important finding explain why the number matters to this owner and this trade?",
    "- Are measured facts, trade knowledge, interpretation, and recommendations clearly distinguished?",
    "- Are all figures, names, dates, metric references, leak IDs, scores, and exposures supported by FACTS?",
    "- Have you avoided all claims about leads, calls, response times, missed opportunities, or capture performance?",
    "- Does the writing sound like a knowledgeable advisor speaking directly to the owner, rather than a dashboard listing statistics?",
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

const METRIC_REF_PATTERN =
  /\b(?:baseline|trend|ticket|referrals|services|team|clients|geography|framework|leaks)\.[a-zA-Z0-9_]+(?:\[\d+\])?(?:\.[a-zA-Z0-9_]+(?:\[\d+\])?)*/g;

/** Remove any dot-separated field names the model leaks into the prose. */
function cleanProse(value: string): string {
  return value
    .replace(new RegExp(`\\s*\\(${METRIC_REF_PATTERN.source}\\)`, "g"), "")
    .replace(METRIC_REF_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function stripMetricRefs<T>(value: T): T {
  if (typeof value === "string") return cleanProse(value) as T;
  if (Array.isArray(value)) return value.map((item) => stripMetricRefs(item)) as T;
  if (value && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (key === "metricRef") continue;
      (value as Record<string, unknown>)[key] = stripMetricRefs(
        (value as Record<string, unknown>)[key],
      );
    }
    return value;
  }
  return value;
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
  const narrative = stripMetricRefs(parsed.data);
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
        "We calculate your pillar scores from your business data using the same fixed rules for every review. The appendix lists each rule.",
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
      creditNote: "The SNIPE Diagnostic™ fee is credited toward a SNIPE Blueprint™ purchased within 14 days of your review.",
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
