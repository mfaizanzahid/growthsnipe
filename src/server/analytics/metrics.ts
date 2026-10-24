import { splitPeople } from "../briefing/analyze";

export interface StoredOrder {
  id: string;
  status: string;
  scheduledAt: string | null;
  totalMinor: number | null;
  inspectorNames: string[];
  buyingAgentName: string | null;
  buyingAgentEmail: string | null;
  buyingAgentPhone: string | null;
  serviceNames: string[];
  referralSource: string | null;
}

export interface RangeTotals {
  jobs: number;
  completed: number;
  pending: number;
  cancelled: number;
  revenueMinor: number;
  avgTicketMinor: number | null;
}

export function toStoredRow(r: {
  status: string;
  scheduledAt: string | null;
  totalMinor: number | null;
  inspectorNamesJson: string;
  buyingAgentName: string | null;
  serviceType: string | null;
}): Pick<StoredOrder, "status" | "scheduledAt" | "totalMinor" | "inspectorNames" | "serviceNames"> {
  let inspectors: string[] = [];
  try {
    const parsed: unknown = JSON.parse(r.inspectorNamesJson || "[]");
    if (Array.isArray(parsed)) inspectors = parsed.filter((x): x is string => typeof x === "string");
  } catch { inspectors = []; }
  const services = typeof r.serviceType === "string"
    ? r.serviceType.split(/[,;|]/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean)
    : [];
  return { status: r.status, scheduledAt: r.scheduledAt, totalMinor: r.totalMinor, inspectorNames: inspectors, serviceNames: services };
}

function isCancelled(o: StoredOrder): boolean { return o.status === "cancelled"; }
function isCompleted(o: StoredOrder): boolean { return o.status === "completed"; }
function inRange(o: StoredOrder, fromMs: number, toMs: number): boolean {
  if (!o.scheduledAt) return false;
  const t = new Date(o.scheduledAt).getTime();
  return Number.isFinite(t) && t >= fromMs && t < toMs;
}

export function rangeTotals(orders: StoredOrder[], fromIso: string, toIso: string): RangeTotals {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const inR = orders.filter((o) => inRange(o, fromMs, toMs));
  const completed = inR.filter(isCompleted);
  const cancelled = inR.filter(isCancelled);
  const pending = inR.filter((o) => !isCompleted(o) && !isCancelled(o));
  const revenueMinor = completed.reduce((s, o) => s + (o.totalMinor ?? 0), 0);
  return {
    jobs: inR.filter((o) => !isCancelled(o)).length,
    completed: completed.length,
    pending: pending.length,
    cancelled: cancelled.length,
    revenueMinor,
    avgTicketMinor: completed.length > 0 ? Math.round(revenueMinor / completed.length) : null,
  };
}

export interface MonthPoint { month: string; revenueMinor: number; jobs: number; completed: number; avgTicketMinor: number | null; repeatJobs: number }
export interface QuarterPoint { quarter: string; revenueMinor: number; jobs: number; avgTicketMinor: number | null }

function lowerBound(sorted: number[], v: number): number {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid]! < v) lo = mid + 1; else hi = mid; }
  return lo;
}

export function monthlySeries(orders: StoredOrder[], yearsBack = 5, now: Date = new Date()): MonthPoint[] {
  const startYear = now.getUTCFullYear() - yearsBack;
  const buckets = new Map<string, { revenueMinor: number; jobs: number; completed: number; repeatJobs: number; agentKeys: string[] }>();
  for (let y = startYear; y <= now.getUTCFullYear(); y += 1) {
    for (let m = 1; m <= 12; m += 1) buckets.set(`${y}-${String(m).padStart(2, "0")}`, { revenueMinor: 0, jobs: 0, completed: 0, repeatJobs: 0, agentKeys: [] });
  }
  // Per-agent sorted job timestamps for trailing-12m repeat checks.
  const agentTimes = new Map<string, number[]>();
  for (const o of orders) {
    if (!o.scheduledAt || isCancelled(o)) continue;
    const t = new Date(o.scheduledAt).getTime();
    if (!Number.isFinite(t)) continue;
    const key = agentKey(o);
    if (key) {
      const arr = agentTimes.get(key);
      if (arr) arr.push(t); else agentTimes.set(key, [t]);
    }
    const d = new Date(t);
    const b = buckets.get(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    if (!b) continue;
    b.jobs += 1;
    if (key) b.agentKeys.push(key);
    if (isCompleted(o)) { b.completed += 1; b.revenueMinor += o.totalMinor ?? 0; }
  }
  for (const arr of agentTimes.values()) arr.sort((a, b) => a - b);
  const yearMs = 365 * 86400000;
  for (const [month, b] of buckets) {
    if (b.agentKeys.length === 0) continue;
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    const monthEnd = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1);
    const winStart = monthEnd - yearMs;
    let repeat = 0;
    for (const key of b.agentKeys) {
      const times = agentTimes.get(key);
      if (!times) continue;
      // Jobs by this agent in [winStart, monthEnd): at least 2 means the
      // month's job came from a repeat referrer. Both bounds matter: without
      // the upper bound, jobs from later months would leak into this one.
      const count = lowerBound(times, monthEnd) - lowerBound(times, winStart);
      if (count >= 2) repeat += 1;
    }
    b.repeatJobs = repeat;
  }
  return [...buckets.entries()].map(([month, b]) => ({ month, revenueMinor: b.revenueMinor, jobs: b.jobs, completed: b.completed, avgTicketMinor: b.completed > 0 ? Math.round(b.revenueMinor / b.completed) : null, repeatJobs: b.repeatJobs }));
}

export function quarterlySeries(months: MonthPoint[]): QuarterPoint[] {
  const byQ = new Map<string, { revenueMinor: number; jobs: number; completed: number }>();
  for (const m of months) {
    const [y, mo] = m.month.split("-").map(Number);
    const q = Math.floor(((mo ?? 1) - 1) / 3) + 1;
    const key = `${y}-Q${q}`;
    const b = byQ.get(key) ?? { revenueMinor: 0, jobs: 0, completed: 0 };
    b.revenueMinor += m.revenueMinor; b.jobs += m.jobs; b.completed += m.completed;
    byQ.set(key, b);
  }
  return [...byQ.entries()].map(([quarter, b]) => ({ quarter, ...b, avgTicketMinor: b.completed > 0 ? Math.round(b.revenueMinor / b.completed) : null }));
}

export function annualGrowthRate(months: MonthPoint[]): Array<{ year: number; revenueMinor: number; growthPct: number | null }> {
  const byYear = new Map<number, number>();
  for (const m of months) {
    const y = Number(m.month.slice(0, 4));
    byYear.set(y, (byYear.get(y) ?? 0) + m.revenueMinor);
  }
  const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]);
  return years.map(([year, revenueMinor], i) => {
    const prev = i > 0 ? years[i - 1]![1] : null;
    return { year, revenueMinor, growthPct: prev === null || prev === 0 ? null : Math.round(((revenueMinor - prev) / prev) * 1000) / 10 };
  });
}

function agentKey(o: StoredOrder): string | null {
  const e = typeof o.buyingAgentEmail === "string" ? o.buyingAgentEmail.trim().toLowerCase() : "";
  if (e) return `e:${e}`;
  const p = typeof o.buyingAgentPhone === "string" ? o.buyingAgentPhone.replace(/\D/g, "") : "";
  if (p.length >= 7) return `p:${p}`;
  return null;
}

export interface AgentRow { key: string; name: string; jobs: number; revenueMinor: number; lastSeen: string | null }

export function agentLeaderboard(orders: StoredOrder[], fromIso: string, toIso: string, limit = 20): AgentRow[] {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const map = new Map<string, AgentRow>();
  for (const o of orders) {
    if (!inRange(o, fromMs, toMs) || isCancelled(o) || !o.buyingAgentName) continue;
    const key = agentKey(o);
    if (!key) continue;
    const cur = map.get(key) ?? { key, name: o.buyingAgentName, jobs: 0, revenueMinor: 0, lastSeen: null };
    cur.jobs += 1;
    if (isCompleted(o)) cur.revenueMinor += o.totalMinor ?? 0;
    if (o.scheduledAt && (!cur.lastSeen || o.scheduledAt > cur.lastSeen)) cur.lastSeen = o.scheduledAt;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.revenueMinor - a.revenueMinor || b.jobs - a.jobs).slice(0, limit);
}

/** Agents active in the prior window with zero jobs in the current window. */
export function droppedAgents(orders: StoredOrder[], curFrom: string, curTo: string, prevFrom: string, prevTo: string): AgentRow[] {
  const cur = new Set(agentLeaderboard(orders, curFrom, curTo, 10000).map((a) => a.key));
  return agentLeaderboard(orders, prevFrom, prevTo, 10000).filter((a) => !cur.has(a.key));
}

export function repeatSplit(orders: StoredOrder[], fromIso: string, toIso: string): { repeatAgentJobs: number; oneOffAgentJobs: number } {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  // Frequency over trailing 12 months ending at toMs (owner rule: same agent email/phone).
  const freq = new Map<string, number>();
  for (const o of orders) {
    if (isCancelled(o) || !o.scheduledAt) continue;
    const t = new Date(o.scheduledAt).getTime();
    if (!Number.isFinite(t) || t >= toMs || t < toMs - 365 * 86400000) continue;
    const key = agentKey(o);
    if (key) freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  let repeatAgentJobs = 0;
  let oneOffAgentJobs = 0;
  for (const o of orders) {
    if (!inRange(o, fromMs, toMs) || isCancelled(o)) continue;
    const key = agentKey(o);
    if (!key) { oneOffAgentJobs += 1; continue; }
    if ((freq.get(key) ?? 0) >= 2) repeatAgentJobs += 1;
    else oneOffAgentJobs += 1;
  }
  return { repeatAgentJobs, oneOffAgentJobs };
}

export interface InspectorRow { name: string; jobs: number; revenueMinor: number; avgTicketMinor: number | null; utilizationPct: number | null }

export function inspectorPerformance(orders: StoredOrder[], fromIso: string, toIso: string, targets: Map<string, number>): InspectorRow[] {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const activeDays = new Set<string>();
  const map = new Map<string, { jobs: number; revenueMinor: number }>();
  for (const o of orders) {
    if (!inRange(o, fromMs, toMs) || isCancelled(o)) continue;
    if (o.scheduledAt) activeDays.add(o.scheduledAt.slice(0, 10));
    for (const name of splitPeople(o.inspectorNames.join(", "))) {
      const cur = map.get(name) ?? { jobs: 0, revenueMinor: 0 };
      cur.jobs += 1;
      if (isCompleted(o)) cur.revenueMinor += o.totalMinor ?? 0;
      map.set(name, cur);
    }
  }
  const days = Math.max(1, activeDays.size);
  return [...map.entries()]
    .map(([name, v]) => {
      const target = targets.get(name);
      return {
        name,
        jobs: v.jobs,
        revenueMinor: v.revenueMinor,
        avgTicketMinor: v.jobs > 0 ? Math.round(v.revenueMinor / v.jobs) : null,
        utilizationPct: target && target > 0 ? Math.round((v.jobs / (days * target)) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => b.jobs - a.jobs);
}

export function basketMix(orders: StoredOrder[], fromIso: string, toIso: string, limit = 10): Array<{ name: string; jobs: number; revenueMinor: number }> {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const map = new Map<string, { jobs: number; revenueMinor: number }>();
  for (const o of orders) {
    if (!inRange(o, fromMs, toMs) || isCancelled(o)) continue;
    for (const s of o.serviceNames) {
      const cur = map.get(s) ?? { jobs: 0, revenueMinor: 0 };
      cur.jobs += 1;
      if (isCompleted(o)) cur.revenueMinor += o.totalMinor ?? 0;
      map.set(s, cur);
    }
  }
  return [...map.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.jobs - a.jobs).slice(0, limit);
}

export function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}
