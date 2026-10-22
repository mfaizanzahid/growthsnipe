import type { BillingStore } from "../repositories/billing";

export interface AnalyticsKpis {
  mrrMinor: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  pastDueSubscriptions: number;
  revenueCollectedMinor: number;
  refundsMinor: number;
  netRevenueMinor: number;
  newSubscriptions: number;
  newOrgs: number;
  canceledCount: number;
  openArMinor: number;
  openInvoiceCount: number;
}

export interface AnalyticsPayload {
  range: { from: string; to: string };
  kpis: AnalyticsKpis;
  revenueByDay: Array<{ date: string; collectedMinor: number; refundedMinor: number }>;
  signupsByDay: Array<{ date: string; orgs: number; subscriptions: number }>;
  subsByPlan: Array<{ planId: string; name: string; active: number; trialing: number; pastDue: number }>;
  revenueByMonth: Array<{ month: string; collectedMinor: number }>;
}

const DAY = 86_400;

function dayKey(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

function monthKey(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 7);
}

function eachDay(fromSec: number, toSec: number): string[] {
  const days: string[] = [];
  const start = Math.floor(fromSec / DAY) * DAY;
  for (let d = start; d <= toSec; d += DAY) days.push(dayKey(d));
  return days;
}

/** Monthly-normalized MRR contribution of one subscription row. */
function mrrContribution(interval: string, recurringMinor: number): number {
  if (interval === "year") return Math.round(recurringMinor / 12);
  return recurringMinor;
}

/**
 * System-wide analytics over [fromSec, toSec].
 * Revenue counts succeeded non-refund transactions as collected and succeeded
 * refund transactions as refunded. MRR is a point-in-time snapshot over
 * active + trialing + past_due subscriptions.
 */
export async function getAnalytics(
  store: BillingStore,
  fromSec: number,
  toSec: number,
): Promise<AnalyticsPayload> {
  const [subs, invoices, orgs, plans] = await Promise.all([
    store.listAllSubscriptions(),
    store.listAllInvoicesWithOrgs(),
    store.listOrganizations(),
    store.listAllPlans(),
  ]);
  const monthStart = Math.floor(Date.UTC(new Date(toSec * 1000).getUTCFullYear(), new Date(toSec * 1000).getUTCMonth() - 11, 1) / 1000);
  // Transactions are millisecond-stamped; everything else is seconds.
  const txns = await store.listTransactionsInRange(Math.min(fromSec, monthStart) * 1000, toSec * 1000);

  const planNames = new Map(plans.map((p) => [p.id, p.name]));

  let mrrMinor = 0;
  let active = 0;
  let trialing = 0;
  let pastDue = 0;
  let newSubs = 0;
  let canceled = 0;
  const byPlan = new Map<string, { active: number; trialing: number; pastDue: number }>();
  const signupDays = new Map<string, number>();
  for (const s of subs) {
    if (s.status === "active" || s.status === "trialing" || s.status === "past_due") {
      mrrMinor += mrrContribution(s.interval, s.recurringAmountMinor);
      const bucket = byPlan.get(s.planId) ?? { active: 0, trialing: 0, pastDue: 0 };
      if (s.status === "active") { active += 1; bucket.active += 1; }
      else if (s.status === "trialing") { trialing += 1; bucket.trialing += 1; }
      else { pastDue += 1; bucket.pastDue += 1; }
      byPlan.set(s.planId, bucket);
    }
    if (s.startDate >= fromSec && s.startDate <= toSec) newSubs += 1;
    if (s.canceledAt && s.canceledAt >= fromSec && s.canceledAt <= toSec) canceled += 1;
    if (s.startDate >= fromSec && s.startDate <= toSec) {
      const k = dayKey(s.startDate);
      signupDays.set(k, (signupDays.get(k) ?? 0) + 1);
    }
  }

  const collectedByDay = new Map<string, number>();
  const refundedByDay = new Map<string, number>();
  const collectedByMonth = new Map<string, number>();
  let collected = 0;
  let refunded = 0;
  for (const t of txns) {
    if (t.status !== "succeeded") continue;
    // NOTE: transaction timestamps are milliseconds; subscriptions/invoices are seconds.
    const tSec = Math.floor(Number(t.createdAt) / 1000);
    if (t.kind === "refund") {
      refunded += t.amountMinor;
      if (tSec >= fromSec) {
        const k = dayKey(tSec);
        refundedByDay.set(k, (refundedByDay.get(k) ?? 0) + t.amountMinor);
      }
      continue;
    }
    if (tSec >= fromSec) {
      collected += t.amountMinor;
      const k = dayKey(tSec);
      collectedByDay.set(k, (collectedByDay.get(k) ?? 0) + t.amountMinor);
    }
    const m = monthKey(tSec);
    collectedByMonth.set(m, (collectedByMonth.get(m) ?? 0) + t.amountMinor);
  }

  let openAr = 0;
  let openCount = 0;
  for (const i of invoices) {
    if (i.status === "due" || i.status === "failed") {
      openAr += i.amountMinor;
      openCount += 1;
    }
  }

  const orgDays = new Map<string, number>();
  let newOrgCount = 0;
  for (const o of orgs) {
    const created = Math.floor(Number(o.createdAt) / 1000);
    if (created >= fromSec && created <= toSec) {
      newOrgCount += 1;
      const k = dayKey(created);
      orgDays.set(k, (orgDays.get(k) ?? 0) + 1);
    }
  }

  const revenueByDay = eachDay(fromSec, toSec).map((date) => ({
    date,
    collectedMinor: collectedByDay.get(date) ?? 0,
    refundedMinor: refundedByDay.get(date) ?? 0,
  }));
  const signupsByDay = eachDay(fromSec, toSec).map((date) => ({
    date,
    orgs: orgDays.get(date) ?? 0,
    subscriptions: signupDays.get(date) ?? 0,
  }));

  const months: string[] = [];
  const cursor = new Date(Date.UTC(new Date(toSec * 1000).getUTCFullYear(), new Date(toSec * 1000).getUTCMonth(), 1));
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  const revenueByMonth = months.map((month) => ({
    month,
    collectedMinor: collectedByMonth.get(month) ?? 0,
  }));

  const subsByPlan = [...byPlan.entries()].map(([planId, v]) => ({
    planId,
    name: planNames.get(planId) ?? planId,
    ...v,
  }));

  return {
    range: {
      from: new Date(fromSec * 1000).toISOString(),
      to: new Date(toSec * 1000).toISOString(),
    },
    kpis: {
      mrrMinor,
      activeSubscriptions: active,
      trialingSubscriptions: trialing,
      pastDueSubscriptions: pastDue,
      revenueCollectedMinor: collected,
      refundsMinor: refunded,
      netRevenueMinor: collected - refunded,
      newSubscriptions: newSubs,
      newOrgs: newOrgCount,
      canceledCount: canceled,
      openArMinor: openAr,
      openInvoiceCount: openCount,
    },
    revenueByDay,
    signupsByDay,
    subsByPlan,
    revenueByMonth,
  };
}
