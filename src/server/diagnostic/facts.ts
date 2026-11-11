import type { BasketItem } from "../analytics/sync";
import type { DiagnosticOrderInsert } from "./store";
import type {
  DiagnosticFacts,
  DiagnosticLeak,
  DiagnosticPillar,
  DiagnosticProvider,
  DiagnosticScoreComponent,
} from "./types";

interface ParsedOrder {
  status: string;
  cancelled: boolean;
  completed: boolean;
  scheduledAt: string | null;
  totalMinor: number | null;
  paid: number | null;
  services: BasketItem[];
  inspectors: string[];
  agentKey: string | null;
  agentName: string | null;
  agency: string | null;
  buyerKey: string | null;
  city: string | null;
  referralSource: string | null;
  month: string | null;
  ts: number | null;
}

function parseArray(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseServices(value: string | null): BasketItem[] {
  const out: BasketItem[] = [];
  for (const item of parseArray(value)) {
    if (!item || typeof item !== "object") continue;
    const row = item as { name?: unknown; kind?: unknown; amountMinor?: unknown };
    if (typeof row.name !== "string" || row.name.trim() === "") continue;
    out.push({
      name: row.name.trim(),
      kind: typeof row.kind === "string" ? row.kind : "base",
      amountMinor: typeof row.amountMinor === "number" ? row.amountMinor : null,
    });
  }
  return out;
}

function parseStrings(value: string | null): string[] {
  return parseArray(value)
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

function cleanKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase().replace(/\s+/g, " ");
  return v === "" ? null : v;
}

function phoneKey(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

function agentKey(row: DiagnosticOrderInsert): string | null {
  const email = cleanKey(row.buyingAgentEmail);
  if (email) return `e:${email}`;
  const phone = phoneKey(row.buyingAgentPhone);
  if (phone) return `p:${phone}`;
  const name = cleanKey(row.buyingAgentName);
  return name ? `n:${name}` : null;
}

function buyerKey(row: DiagnosticOrderInsert): string | null {
  const email = cleanKey(row.buyerEmail);
  if (email) return `e:${email}`;
  const phone = phoneKey(row.buyerPhone);
  if (phone) return `p:${phone}`;
  const name = cleanKey(row.buyerName);
  return name ? `n:${name}` : null;
}

function monthKey(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? `${m[1]}-${m[2]}` : null;
}

function parseOrder(row: DiagnosticOrderInsert): ParsedOrder {
  const status = (row.status ?? "scheduled").toLowerCase();
  const ts = row.scheduledAt ? new Date(row.scheduledAt).getTime() : null;
  return {
    status,
    cancelled: status === "cancelled",
    completed: status === "completed",
    scheduledAt: row.scheduledAt,
    totalMinor: row.totalMinor,
    paid: row.paid,
    services: parseServices(row.servicesJson),
    inspectors: parseStrings(row.inspectorNames),
    agentKey: agentKey(row),
    agentName: row.buyingAgentName,
    agency: row.agencyName,
    buyerKey: buyerKey(row),
    city: row.city,
    referralSource: row.referralSource,
    month: monthKey(row.scheduledAt),
    ts: Number.isFinite(ts) ? ts : null,
  };
}

function pct1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function percent(value: number | null): string {
  return value === null ? "n/a" : `${value}%`;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank))] ?? null;
}

function monthList(fromIso: string, toIso: string): string[] {
  const from = new Date(fromIso);
  // The window end is exclusive (the first of the current month), so step back
  // one millisecond to land on the last full month.
  const to = new Date(new Date(toIso).getTime() - 1);
  const out: string[] = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  const endY = to.getUTCFullYear();
  const endM = to.getUTCMonth();
  for (let guard = 0; guard < 24; guard += 1) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    if (y === endY && m === endM) break;
    m += 1;
    if (m === 12) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

function quarterOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const q = Math.floor(((m ?? 1) - 1) / 3) + 1;
  return `${y}-Q${q}`;
}

function money(minor: number | null, currency: string): string {
  if (minor === null) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

function monthYear(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function metricValue(facts: DiagnosticFacts, ref: string): unknown {
  const parts = ref.split(".").flatMap((part) => {
    const out: string[] = [];
    const re = /([^[\]]+)|\[(\d+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(part)) !== null) {
      if (match[1] !== undefined) out.push(match[1]);
      else if (match[2] !== undefined) out.push(match[2]);
    }
    return out;
  });
  let current: unknown = facts;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export interface BuildFactsInput {
  provider: DiagnosticProvider;
  businessName: string | null;
  trade: string | null;
  currency: string;
  window: { from: string; to: string; monthsCovered: number };
  orders: DiagnosticOrderInsert[];
  now?: number;
}

export function buildFacts(input: BuildFactsInput): DiagnosticFacts {
  const now = input.now ?? Date.now();
  const rows = input.orders.map(parseOrder);
  const currency = input.currency || "USD";

  const cancelledRows = rows.filter((r) => r.cancelled);
  const completedRows = rows.filter((r) => r.completed);
  const openRows = rows.filter((r) => !r.cancelled && !r.completed);
  const jobs = rows.filter((r) => !r.cancelled).length;
  const revenueMinor = completedRows.reduce((sum, r) => sum + (r.totalMinor ?? 0), 0);
  const avgTicketMinor = completedRows.length > 0 ? Math.round(revenueMinor / completedRows.length) : null;
  const totalOrders = rows.length;
  const cancelRatePct = totalOrders > 0 ? pct1((cancelledRows.length / totalOrders) * 100) : null;
  const days = Math.max(1, Math.round((new Date(input.window.to).getTime() - new Date(input.window.from).getTime()) / 86_400_000));

  const months = monthList(input.window.from, input.window.to);
  const monthlyMap = new Map<string, { jobs: number; completed: number; revenueMinor: number }>();
  for (const month of months) monthlyMap.set(month, { jobs: 0, completed: 0, revenueMinor: 0 });
  for (const row of rows) {
    if (row.cancelled || !row.month) continue;
    const bucket = monthlyMap.get(row.month);
    if (!bucket) continue;
    bucket.jobs += 1;
    if (row.completed) {
      bucket.completed += 1;
      bucket.revenueMinor += row.totalMinor ?? 0;
    }
  }
  const monthly = months.map((month) => {
    const bucket = monthlyMap.get(month) ?? { jobs: 0, completed: 0, revenueMinor: 0 };
    return {
      month,
      jobs: bucket.jobs,
      completed: bucket.completed,
      revenueMinor: bucket.revenueMinor,
      avgTicketMinor: bucket.completed > 0 ? Math.round(bucket.revenueMinor / bucket.completed) : null,
    };
  });
  const activeMonths = monthly.filter((m) => m.jobs > 0).length;

  const quarterMap = new Map<string, { jobs: number; completed: number; revenueMinor: number }>();
  for (const month of monthly) {
    const key = quarterOf(month.month);
    const bucket = quarterMap.get(key) ?? { jobs: 0, completed: 0, revenueMinor: 0 };
    bucket.jobs += month.jobs;
    bucket.completed += month.completed;
    bucket.revenueMinor += month.revenueMinor;
    quarterMap.set(key, bucket);
  }
  const quarters = [...quarterMap.entries()].map(([quarter, b]) => ({
    quarter,
    jobs: b.jobs,
    completed: b.completed,
    revenueMinor: b.revenueMinor,
    avgTicketMinor: b.completed > 0 ? Math.round(b.revenueMinor / b.completed) : null,
  }));

  const yearMap = new Map<number, number>();
  const monthsByYear = new Map<number, number>();
  for (const month of monthly) {
    const year = Number(month.month.slice(0, 4));
    yearMap.set(year, (yearMap.get(year) ?? 0) + month.revenueMinor);
    monthsByYear.set(year, (monthsByYear.get(year) ?? 0) + 1);
  }
  // A trailing 12-month window only has full calendar years when it starts in
  // January, so year-over-year is hidden unless both years are complete.
  const yoy = [...yearMap.entries()]
    .filter(([year]) => monthsByYear.get(year) === 12)
    .sort((a, b) => a[0] - b[0])
    .map(([year, revenue], index, all) => {
      const prev = index > 0 ? all[index - 1]![1] : null;
      return {
        year,
        revenueMinor: revenue,
        growthPct: prev === null || prev === 0 ? null : pct1(((revenue - prev) / prev) * 100),
      };
    });

  const activeMonthly = monthly.filter((m) => m.jobs > 0);
  const sortedByRevenue = [...activeMonthly].sort((a, b) => b.revenueMinor - a.revenueMinor);
  const bestMonth = sortedByRevenue[0]?.month ?? null;
  const worstMonth = sortedByRevenue.length > 0 ? sortedByRevenue[sortedByRevenue.length - 1]!.month : null;
  const revenues = activeMonthly.map((m) => m.revenueMinor);
  const meanRevenue = revenues.length > 0 ? revenues.reduce((s, v) => s + v, 0) / revenues.length : 0;
  const seasonalityIndex =
    revenues.length >= 3 && meanRevenue > 0
      ? pct1(((Math.max(...revenues) - Math.min(...revenues)) / meanRevenue) * 100)
      : null;

  const totals = completedRows
    .map((r) => r.totalMinor)
    .filter((v): v is number => typeof v === "number")
    .sort((a, b) => a - b);
  const distributionMinor = {
    p25: percentile(totals, 25),
    p50: percentile(totals, 50),
    p75: percentile(totals, 75),
    p90: percentile(totals, 90),
    max: totals.length > 0 ? totals[totals.length - 1]! : null,
  };

  const unpaidRows = completedRows.filter((r) => r.paid === 0);
  const unpaid = {
    count: unpaidRows.length,
    amountMinor: unpaidRows.reduce((sum, r) => sum + (r.totalMinor ?? 0), 0),
  };

  // Referrals / agents
  interface AgentAgg { name: string; jobs: number; revenueMinor: number; lastSeen: number | null; firstSeen: number | null }
  const agentAgg = new Map<string, AgentAgg>();
  for (const row of rows) {
    if (row.cancelled || !row.agentKey) continue;
    const agg = agentAgg.get(row.agentKey) ?? {
      name: row.agentName ?? "Unknown agent",
      jobs: 0,
      revenueMinor: 0,
      lastSeen: null,
      firstSeen: null,
    };
    agg.jobs += 1;
    if (row.completed) agg.revenueMinor += row.totalMinor ?? 0;
    if (row.ts !== null) {
      agg.lastSeen = agg.lastSeen === null ? row.ts : Math.max(agg.lastSeen, row.ts);
      agg.firstSeen = agg.firstSeen === null ? row.ts : Math.min(agg.firstSeen, row.ts);
    }
    agentAgg.set(row.agentKey, agg);
  }
  const totalAgentJobs = [...agentAgg.values()].reduce((sum, a) => sum + a.jobs, 0);
  const statusFor = (lastSeen: number | null): "active" | "cooling" | "dormant" => {
    if (lastSeen === null) return "dormant";
    const age = now - lastSeen;
    if (age <= 30 * 86_400_000) return "active";
    if (age <= 90 * 86_400_000) return "cooling";
    return "dormant";
  };
  const topAgents = [...agentAgg.values()]
    .sort((a, b) => b.revenueMinor - a.revenueMinor || b.jobs - a.jobs)
    .slice(0, 6)
    .map((a) => ({
      name: a.name,
      jobs: a.jobs,
      revenueMinor: a.revenueMinor,
      sharePct: totalAgentJobs > 0 ? pct1((a.jobs / totalAgentJobs) * 100) : 0,
      lastSeen: a.lastSeen ? new Date(a.lastSeen).toISOString() : null,
      status: statusFor(a.lastSeen),
    }));
  const topAgentShare = topAgents[0]?.sharePct ?? null;
  const concentrationIndex = totalAgentJobs > 0
    ? Math.round([...agentAgg.values()].reduce((sum, a) => sum + Math.pow((a.jobs / totalAgentJobs) * 100, 2), 0))
    : null;

  interface AgencyAgg { jobs: number; revenueMinor: number }
  const agencyAgg = new Map<string, AgencyAgg>();
  for (const row of rows) {
    if (row.cancelled || !row.agency) continue;
    const agg = agencyAgg.get(row.agency) ?? { jobs: 0, revenueMinor: 0 };
    agg.jobs += 1;
    if (row.completed) agg.revenueMinor += row.totalMinor ?? 0;
    agencyAgg.set(row.agency, agg);
  }
  const totalAgencyJobs = [...agencyAgg.values()].reduce((s, a) => s + a.jobs, 0);
  const topAgencies = [...agencyAgg.entries()]
    .map(([name, a]) => ({
      name,
      jobs: a.jobs,
      revenueMinor: a.revenueMinor,
      sharePct: totalAgencyJobs > 0 ? pct1((a.jobs / totalAgencyJobs) * 100) : 0,
    }))
    .sort((a, b) => b.revenueMinor - a.revenueMinor || b.jobs - a.jobs)
    .slice(0, 5);

  const droppedAgents = [...agentAgg.values()]
    .filter((a) => a.lastSeen !== null && now - a.lastSeen > 90 * 86_400_000)
    .sort((a, b) => b.jobs - a.jobs)
    .slice(0, 6)
    .map((a) => ({
      name: a.name,
      jobs: a.jobs,
      revenueMinor: a.revenueMinor,
      lastSeen: a.lastSeen ? new Date(a.lastSeen).toISOString() : null,
    }));
  const newAgents = [...agentAgg.values()]
    .filter((a) => a.firstSeen !== null && now - a.firstSeen <= 90 * 86_400_000)
    .sort((a, b) => b.jobs - a.jobs)
    .slice(0, 6)
    .map((a) => ({
      name: a.name,
      jobs: a.jobs,
      revenueMinor: a.revenueMinor,
      firstSeen: a.firstSeen ? new Date(a.firstSeen).toISOString() : null,
    }));
  const repeatAgentJobs = [...agentAgg.values()].filter((a) => a.jobs >= 2).reduce((s, a) => s + a.jobs, 0);
  const repeatAgentSharePct = totalAgentJobs > 0 ? pct1((repeatAgentJobs / totalAgentJobs) * 100) : null;

  // Services (job penetration only: revenue by service is not consistent
  // across providers, so it is deliberately not reported).
  interface ServiceAgg { jobs: number }
  const serviceAgg = new Map<string, ServiceAgg>();
  let addOnJobs = 0;
  let serviceItemCount = 0;
  const addOnPrices: number[] = [];
  const jobsWithServices = rows.filter((r) => !r.cancelled);
  for (const row of jobsWithServices) {
    const names = new Set<string>();
    let hasAddOn = false;
    for (const item of row.services) {
      names.add(item.name);
      serviceItemCount += 1;
      if (item.kind === "addon") {
        hasAddOn = true;
        if (typeof item.amountMinor === "number" && item.amountMinor > 0) addOnPrices.push(item.amountMinor);
      }
    }
    if (hasAddOn) addOnJobs += 1;
    for (const name of names) {
      const agg = serviceAgg.get(name) ?? { jobs: 0 };
      agg.jobs += 1;
      serviceAgg.set(name, agg);
    }
  }
  const totalServiceJobs = jobsWithServices.length;
  const serviceMix = [...serviceAgg.entries()]
    .map(([name, agg]) => ({
      name,
      jobs: agg.jobs,
      penetrationPct: totalServiceJobs > 0 ? pct1((agg.jobs / totalServiceJobs) * 100) : 0,
    }))
    .sort((a, b) => b.jobs - a.jobs)
    .slice(0, 8);
  const addOnAttachPct = totalServiceJobs > 0 ? pct1((addOnJobs / totalServiceJobs) * 100) : null;
  const avgServicesPerJob = totalServiceJobs > 0 ? Math.round((serviceItemCount / totalServiceJobs) * 10) / 10 : null;
  addOnPrices.sort((a, b) => a - b);
  const medianAddOnPrice = percentile(addOnPrices, 50);

  // Team
  interface InspectorAgg { jobs: number; revenueMinor: number }
  const inspectorAgg = new Map<string, InspectorAgg>();
  const activeDays = new Set<string>();
  let teamJobs = 0;
  for (const row of jobsWithServices) {
    if (row.scheduledAt) activeDays.add(row.scheduledAt.slice(0, 10));
    if (row.inspectors.length > 1) teamJobs += 1;
    for (const name of row.inspectors) {
      const agg = inspectorAgg.get(name) ?? { jobs: 0, revenueMinor: 0 };
      agg.jobs += 1;
      if (row.completed) agg.revenueMinor += row.totalMinor ?? 0;
      inspectorAgg.set(name, agg);
    }
  }
  const inspectorTarget = 2;
  const inspectors = [...inspectorAgg.entries()]
    .map(([name, agg]) => ({
      name,
      jobs: agg.jobs,
      revenueMinor: agg.revenueMinor,
      avgTicketMinor: agg.jobs > 0 ? Math.round(agg.revenueMinor / agg.jobs) : null,
      utilizationPct:
        activeDays.size > 0
          ? pct1((agg.jobs / (activeDays.size * inspectorTarget)) * 100)
          : null,
    }))
    .sort((a, b) => b.jobs - a.jobs)
    .slice(0, 10);
  const teamJobSharePct = totalServiceJobs > 0 ? pct1((teamJobs / totalServiceJobs) * 100) : null;

  // Clients
  interface ClientAgg { jobs: number }
  const clientAgg = new Map<string, ClientAgg>();
  let identifiedJobs = 0;
  for (const row of jobsWithServices) {
    if (!row.buyerKey) continue;
    identifiedJobs += 1;
    const agg = clientAgg.get(row.buyerKey) ?? { jobs: 0 };
    agg.jobs += 1;
    clientAgg.set(row.buyerKey, agg);
  }
  const distinctClients = clientAgg.size;
  const repeatClientJobs = [...clientAgg.values()].filter((c) => c.jobs >= 2).reduce((s, c) => s + c.jobs, 0);
  const repeatClientSharePct = identifiedJobs > 0 ? pct1((repeatClientJobs / identifiedJobs) * 100) : null;
  const avgJobsPerClient = distinctClients > 0 ? Math.round((identifiedJobs / distinctClients) * 10) / 10 : null;
  const identityCoveragePct = totalServiceJobs > 0 ? pct1((identifiedJobs / totalServiceJobs) * 100) : null;

  // Geography
  const cityAgg = new Map<string, { jobs: number; revenueMinor: number }>();
  for (const row of jobsWithServices) {
    if (!row.city) continue;
    const agg = cityAgg.get(row.city) ?? { jobs: 0, revenueMinor: 0 };
    agg.jobs += 1;
    if (row.completed) agg.revenueMinor += row.totalMinor ?? 0;
    cityAgg.set(row.city, agg);
  }
  const topCities = [...cityAgg.entries()]
    .map(([city, agg]) => ({
      city,
      jobs: agg.jobs,
      revenueMinor: agg.revenueMinor,
      sharePct: totalServiceJobs > 0 ? pct1((agg.jobs / totalServiceJobs) * 100) : 0,
    }))
    .sort((a, b) => b.jobs - a.jobs)
    .slice(0, 6);

  const avgUtilization =
    inspectors.length > 0
      ? inspectors.reduce((s, i) => s + (i.utilizationPct ?? 0), 0) / inspectors.length
      : null;

  const scorePillar = (components: DiagnosticScoreComponent[]): number | null => {
    const available = components.filter((component) => component.points !== null);
    const totalWeight = available.reduce((sum, component) => sum + component.weight, 0);
    if (available.length === 0 || totalWeight <= 0) return null;
    const weighted = available.reduce(
      (sum, component) => sum + (component.points ?? 0) * component.weight,
      0,
    );
    return Math.round(clamp(weighted / totalWeight));
  };
  const pillarStatus = (score: number | null): DiagnosticPillar["status"] => {
    if (score === null) return "not_assessed";
    if (score >= 70) return "strength";
    if (score >= 45) return "watch";
    return "leak";
  };

  const jobsPerWeekValue = days > 0 ? Math.round((jobs / (days / 7)) * 10) / 10 : null;
  const firstHalfRevenue = monthly.slice(0, 6).reduce((sum, month) => sum + month.revenueMinor, 0);
  const secondHalfRevenue = monthly.slice(6).reduce((sum, month) => sum + month.revenueMinor, 0);
  const momentumPct =
    firstHalfRevenue > 0
      ? pct1(((secondHalfRevenue - firstHalfRevenue) / firstHalfRevenue) * 100)
      : null;
  const ticketSpread =
    distributionMinor.p50 && distributionMinor.p90
      ? distributionMinor.p90 / distributionMinor.p50
      : null;
  const topCitySharePct = topCities[0]?.sharePct ?? null;
  const inspectorJobs = inspectors.map((inspector) => inspector.jobs);
  const inspectorMean =
    inspectorJobs.length > 0
      ? inspectorJobs.reduce((sum, count) => sum + count, 0) / inspectorJobs.length
      : null;
  const inspectorCv =
    inspectorMean && inspectorMean > 0
      ? Math.sqrt(
          inspectorJobs.reduce((sum, count) => sum + Math.pow(count - inspectorMean, 2), 0) /
            inspectorJobs.length,
        ) / inspectorMean
      : null;
  const sourceAgg = new Map<string, number>();
  for (const row of jobsWithServices) {
    const source = row.referralSource?.trim();
    if (!source) continue;
    sourceAgg.set(source, (sourceAgg.get(source) ?? 0) + 1);
  }
  const topSource = [...sourceAgg.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  const sComponents: DiagnosticScoreComponent[] = [
    {
      label: "Revenue momentum",
      value: momentumPct === null ? "n/a" : `${momentumPct > 0 ? "+" : ""}${momentumPct}%`,
      points: momentumPct === null ? null : clamp(60 + momentumPct * 1.5),
      weight: 0.5,
      rule: "How your revenue in the last six months compares with the six months before. Flat revenue scores 60; each 1% of growth adds 1.5 points, up to 100.",
    },
    {
      label: "Booking health",
      value: percent(cancelRatePct),
      points: cancelRatePct === null ? null : clamp(100 - cancelRatePct * 4),
      weight: 0.3,
      rule: "How often jobs are cancelled. No cancellations scores 100; each percentage point of cancellation rate lowers the score by 4.",
    },
    {
      label: "Active months",
      value: `${activeMonths} of 12`,
      points: clamp((activeMonths / 12) * 100),
      weight: 0.2,
      rule: "How many of the 12 months had at least one job. Every active month adds points, up to 100.",
    },
  ];
  const nComponents: DiagnosticScoreComponent[] = [
    {
      label: "Add-on attachment",
      value: percent(addOnAttachPct),
      points: addOnAttachPct === null ? null : clamp(addOnAttachPct * 2),
      weight: 0.5,
      rule: "How often jobs include an add-on. A 50% add-on rate scores 100; lower rates score lower.",
    },
    {
      label: "Service breadth",
      value: avgServicesPerJob === null ? "n/a" : `${avgServicesPerJob} per job`,
      points: avgServicesPerJob === null ? null : clamp(avgServicesPerJob * 40),
      weight: 0.3,
      rule: "How many services the average job includes. Two and a half services per job scores 100.",
    },
    {
      label: "Ticket spread",
      value: ticketSpread === null ? "n/a" : `${ticketSpread.toFixed(2)}x`,
      points: ticketSpread === null ? null : clamp((ticketSpread - 1) * 80),
      weight: 0.2,
      rule: "How much higher your best tickets are than your typical ticket. A wider gap scores higher, up to 100.",
    },
  ];
  const pComponents: DiagnosticScoreComponent[] = [
    {
      label: "Partner concentration",
      value: percent(topAgentShare),
      points:
        topAgentShare === null
          ? null
          : clamp(100 - Math.max(0, topAgentShare - 25) * 2),
      weight: 0.5,
      rule: "How much of your referred work comes from one partner. No partner above 25% scores 100; each point above 25% costs 2 points.",
    },
    {
      label: "Referral breadth",
      value: `${agentAgg.size} partners`,
      points: clamp(agentAgg.size * 8),
      weight: 0.25,
      rule: "How many referral partners send you work. Twelve or more active partners scores 100; fewer score lower.",
    },
    {
      label: "Geographic spread",
      value: percent(topCitySharePct),
      points:
        topCitySharePct === null
          ? null
          : clamp(100 - Math.max(0, topCitySharePct - 30) * 1.5),
      weight: 0.25,
      rule: "How spread out your work is across cities. No city above 30% of jobs scores 100; each point above 30% costs 1.5 points.",
    },
  ];
  const eComponents: DiagnosticScoreComponent[] = [
    {
      label: "Repeat client share",
      value: percent(repeatClientSharePct),
      points:
        repeatClientSharePct === null ? null : clamp(repeatClientSharePct * 1.5),
      weight: 0.5,
      rule: "How many clients come back. A 67% repeat rate scores 100; lower rates score lower.",
    },
    {
      label: "Inspector balance",
      value: inspectorCv === null ? "n/a" : `${pct1(inspectorCv * 100)}% variation`,
      points: inspectorCv === null ? null : clamp(100 - inspectorCv * 100),
      weight: 0.3,
      rule: "How evenly completed jobs are spread across inspectors. Even spread scores 100; uneven spread scores lower.",
    },
    {
      label: "Capacity utilization",
      value: avgUtilization === null ? "n/a" : percent(pct1(avgUtilization)),
      points:
        avgUtilization === null ? null : clamp(100 - Math.abs(avgUtilization - 75)),
      weight: 0.2,
      rule: "How full the schedule is compared with a two-job-per-day baseline. Around 75% scores 100; being far above or below lowers the score.",
    },
  ];

  const makePillar = (
    code: DiagnosticPillar["code"],
    name: string,
    components: DiagnosticScoreComponent[],
    context: Array<{ label: string; value: string }>,
  ): DiagnosticPillar => {
    const score = scorePillar(components);
    return { code, name, score, status: pillarStatus(score), context, components };
  };

  const framework: DiagnosticPillar[] = [
    makePillar("S", "Size the Gap", sComponents, [
      { label: "Completed revenue", value: money(revenueMinor, currency) },
      { label: "Completed jobs", value: `${completedRows.length}` },
      { label: "Average ticket", value: money(avgTicketMinor, currency) },
      { label: "Jobs per week", value: jobsPerWeekValue === null ? "n/a" : `${jobsPerWeekValue}` },
      { label: "Cancellation rate", value: percent(cancelRatePct) },
    ]),
    makePillar("N", "Net-Ticket Architecture", nComponents, [
      { label: "Add-on attach", value: percent(addOnAttachPct) },
      { label: "Services per job", value: avgServicesPerJob === null ? "n/a" : `${avgServicesPerJob}` },
      { label: "Median ticket", value: money(distributionMinor.p50, currency) },
      { label: "Top-decile ticket", value: money(distributionMinor.p90, currency) },
    ]),
    {
      code: "I",
      name: "Instant Capture",
      score: null,
      status: "not_assessed",
      context: [
        { label: "Connected data", value: "No phone, lead, or CRM data in Release 1" },
        { label: "Response-time findings", value: "Not assessed" },
      ],
      components: [],
    },
    makePillar("P", "Pipeline Engine", pComponents, [
      { label: "Active partners", value: `${agentAgg.size}` },
      { label: "Top partner share", value: percent(topAgentShare) },
      { label: "Top city share", value: percent(topCitySharePct) },
      ...(topSource
        ? [{ label: "Top referral source", value: `${topSource[0]} (${topSource[1]} jobs)` }]
        : []),
    ]),
    makePillar("E", "Expand and Evaluate", eComponents, [
      { label: "Repeat client share", value: percent(repeatClientSharePct) },
      { label: "Jobs per client", value: avgJobsPerClient === null ? "n/a" : `${avgJobsPerClient}` },
      { label: "Inspectors", value: `${inspectorAgg.size}` },
      { label: "Average utilization", value: avgUtilization === null ? "n/a" : percent(pct1(avgUtilization)) },
    ]),
  ];

  // Leak catalog
  const leaks: DiagnosticLeak[] = [];
  const pushLeak = (leak: DiagnosticLeak) => leaks.push(leak);

  if (cancelRatePct !== null && cancelledRows.length > 0 && avgTicketMinor !== null && cancelRatePct >= 8) {
    const low = Math.round(cancelledRows.length * avgTicketMinor * 0.2);
    const high = Math.round(cancelledRows.length * avgTicketMinor * 0.4);
    pushLeak({
      id: "L1",
      category: "cancellation",
      pillar: "S",
      title: "Cancellations are eroding booked revenue",
      evidence: [
        { metricRef: "baseline.cancelRatePct", value: `${cancelRatePct}%` },
        { metricRef: "baseline.cancelled", value: `${cancelledRows.length} cancelled jobs` },
      ],
      quantifiable: true,
      exposure: {
        lowMinor: low,
        highMinor: high,
        assumptions: ["Assumes 20% to 40% of cancellations are preventable with faster confirmation and follow-up."],
        method: "Cancelled jobs x average ticket x recovery rate",
      },
    });
  }

  if (addOnAttachPct !== null && addOnAttachPct < 40 && medianAddOnPrice !== null) {
    const jobsWithoutAddOn = jobsWithServices.filter((r) => !r.services.some((s) => s.kind === "addon")).length;
    const low = Math.round(jobsWithoutAddOn * medianAddOnPrice * 0.1);
    const high = Math.round(jobsWithoutAddOn * medianAddOnPrice * 0.2);
    pushLeak({
      id: "L2",
      category: "ticket",
      pillar: "N",
      title: "Add-ons are attached to too few jobs",
      evidence: [
        { metricRef: "services.addOnAttachPct", value: `${addOnAttachPct}%` },
        { metricRef: "services.mix", value: `median add-on ${money(medianAddOnPrice, currency)}` },
      ],
      quantifiable: true,
      exposure: {
        lowMinor: low,
        highMinor: high,
        assumptions: ["Assumes 10% to 20% of jobs without an add-on would accept one with a consistent offer."],
        method: "Jobs without add-on x median add-on price x attach lift",
      },
    });
  } else if (addOnAttachPct !== null && addOnAttachPct < 40) {
    pushLeak({
      id: "L2",
      category: "ticket",
      pillar: "N",
      title: "Add-ons are attached to too few jobs",
      evidence: [{ metricRef: "services.addOnAttachPct", value: `${addOnAttachPct}%` }],
      quantifiable: false,
    });
  }

  if (topAgentShare !== null && topAgentShare >= 35) {
    pushLeak({
      id: "L3",
      category: "referral",
      pillar: "P",
      title: "Referral demand is concentrated in a few partners",
      evidence: [
        { metricRef: "referrals.topAgents[0].sharePct", value: `${topAgentShare}%` },
        { metricRef: "referrals.activeAgentCount", value: `${agentAgg.size} active partners` },
      ],
      quantifiable: false,
    });
  }

  if (droppedAgents.length > 0) {
    pushLeak({
      id: "L4",
      category: "demand",
      pillar: "P",
      title: "Previously active referrers have gone quiet",
      evidence: [
        { metricRef: "referrals.droppedAgents", value: `${droppedAgents.length} partners dormant 90+ days` },
      ],
      quantifiable: false,
    });
  }

  if (repeatAgentSharePct !== null && repeatAgentSharePct < 40) {
    pushLeak({
      id: "L5",
      category: "repeat",
      pillar: "E",
      title: "Most referring partners are one-job relationships",
      evidence: [{ metricRef: "referrals.repeatAgentSharePct", value: `${repeatAgentSharePct}% of jobs came from repeat referrers` }],
      quantifiable: false,
    });
  }

  if (unpaid.count > 0 && unpaid.amountMinor > 0) {
    pushLeak({
      id: "L6",
      category: "booking",
      pillar: "S",
      title: "Completed jobs remain flagged unpaid",
      evidence: [
        { metricRef: "ticket.unpaid.count", value: `${unpaid.count} completed jobs` },
        { metricRef: "ticket.unpaid.amountMinor", value: money(unpaid.amountMinor, currency) },
      ],
      quantifiable: true,
      exposure: {
        lowMinor: unpaid.amountMinor,
        highMinor: unpaid.amountMinor,
        assumptions: ["Observed on completed jobs flagged unpaid in the connected system."],
        method: "Sum of completed jobs flagged unpaid",
      },
    });
  }

  if (avgUtilization !== null && (avgUtilization > 95 || avgUtilization < 50)) {
    pushLeak({
      id: "L7",
      category: "capacity",
      pillar: "E",
      title: avgUtilization > 95 ? "Schedule is close to its practical ceiling" : "Capacity is underused",
      evidence: [{ metricRef: "team.inspectors[0].utilizationPct", value: `${pct1(avgUtilization)}% average utilization` }],
      quantifiable: false,
    });
  }

  if (leaks.length === 0) {
    pushLeak({
      id: "L1",
      category: "booking",
      pillar: "S",
      title: "No material leak detected in the measurable data",
      evidence: [{ metricRef: "baseline.jobs", value: `${jobs} jobs reviewed` }],
      quantifiable: false,
    });
  }

  return {
    meta: {
      provider: input.provider,
      businessName: input.businessName,
      trade: input.trade,
      currency,
      generatedAt: new Date(now).toISOString(),
      window: input.window,
      periodLabel: `${monthYear(input.window.from)} to ${monthYear(
        new Date(new Date(input.window.to).getTime() - 1).toISOString(),
      )}`,
    },
    baseline: {
      jobs,
      completed: completedRows.length,
      cancelled: cancelledRows.length,
      open: openRows.length,
      cancelRatePct,
      revenueMinor,
      avgTicketMinor,
      jobsPerWeek: jobsPerWeekValue,
      revenuePerDayMinor: Math.round(revenueMinor / days),
      activeMonths,
    },
    trend: {
      monthly,
      quarters,
      yoy,
      bestMonth,
      worstMonth,
      seasonalityIndex,
    },
    ticket: { distributionMinor, unpaid },
    referrals: {
      activeAgentCount: agentAgg.size,
      topAgents,
      topAgencies,
      droppedAgents,
      newAgents,
      repeatAgentSharePct,
      concentrationIndex,
    },
    services: {
      mix: serviceMix,
      addOnAttachPct,
      avgServicesPerJob,
    },
    team: {
      inspectorCount: inspectorAgg.size,
      inspectors,
      teamJobSharePct,
    },
    clients: {
      repeatClientSharePct,
      avgJobsPerClient,
      identityCoveragePct,
    },
    geography: { topCities },
    framework,
    leaks,
  };
}

