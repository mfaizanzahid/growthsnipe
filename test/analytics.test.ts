import { beforeEach, describe, expect, it } from "vitest";
import { getAnalytics } from "../src/server/billing/analytics";
import { memoryStore, setStoreClock } from "./memory-store";

const DAY = 86_400;
const T0 = 1_700_000_000; // 2023-11-14T22:13:20Z (seconds)
const FROM = T0;
const TO = T0 + 6 * DAY;

async function seedScenario() {
  const store = memoryStore();
  store.seed.plan({ id: "p1", name: "Launch" });

  setStoreClock((T0 + DAY) * 1000);
  store.seed.org({ id: "o1", name: "Acme" });
  setStoreClock((T0 - 30 * DAY) * 1000);
  store.seed.org({ id: "o2", name: "Beta" });

  // Active monthly sub starting in range.
  store.seed.subscription({
    id: "s1", orgId: "o1", planId: "p1",
    interval: "month", status: "active",
    startDate: T0 + DAY, nextCharge: T0 + 31 * DAY, recurringAmountMinor: 19900,
  });
  // Past-due yearly sub started long ago (MRR 120000/12 = 10000).
  store.seed.subscription({
    id: "s2", orgId: "o2", planId: "p1",
    interval: "year", status: "past_due",
    startDate: T0 - 100 * DAY, nextCharge: T0 - DAY, recurringAmountMinor: 120000,
    pastDueSince: T0 - DAY,
  });
  // Canceled inside the range.
  store.seed.subscription({
    id: "s3", orgId: "o2", planId: "p1",
    interval: "month", status: "canceled",
    startDate: T0 - 50 * DAY, nextCharge: T0 - 20 * DAY, recurringAmountMinor: 19900,
    canceledAt: T0 + 2 * DAY,
  });

  // Transactions are millisecond-stamped.
  setStoreClock((T0 + DAY) * 1000);
  await store.insertTransaction({ orgId: "o1", kind: "signup_charge", status: "succeeded", amountMinor: 69600 });
  setStoreClock((T0 + 2 * DAY) * 1000);
  await store.insertTransaction({ orgId: "o1", kind: "renewal", status: "succeeded", amountMinor: 19900 });
  await store.insertTransaction({ orgId: "o1", kind: "renewal", status: "failed", amountMinor: 19900 });
  setStoreClock((T0 + 3 * DAY) * 1000);
  await store.insertTransaction({ orgId: "o1", kind: "refund", status: "succeeded", amountMinor: 5000 });
  // Outside the range — must not count toward revenue.
  setStoreClock((T0 - 40 * DAY) * 1000);
  await store.insertTransaction({ orgId: "o2", kind: "renewal", status: "succeeded", amountMinor: 19900 });

  await store.createInvoice(
    { id: "inv-open", orgId: "o2", type: "recurring", status: "due", amountMinor: 19900 },
    [{ description: "Renewal", amountMinor: 19900 }],
    T0,
  );
  return store;
}

beforeEach(() => {
  setStoreClock(null);
});

describe("getAnalytics", () => {
  it("aggregates KPIs, buckets revenue by day, and splits subs by plan", async () => {
    const store = await seedScenario();
    const a = await getAnalytics(store, FROM, TO);

    // MRR: 19900 (monthly active) + 120000/12 (yearly past_due). Canceled excluded.
    expect(a.kpis.mrrMinor).toBe(29900);
    expect(a.kpis.activeSubscriptions).toBe(1);
    expect(a.kpis.pastDueSubscriptions).toBe(1);
    expect(a.kpis.revenueCollectedMinor).toBe(69600 + 19900);
    expect(a.kpis.refundsMinor).toBe(5000);
    expect(a.kpis.netRevenueMinor).toBe(69600 + 19900 - 5000);
    expect(a.kpis.newSubscriptions).toBe(1);
    expect(a.kpis.newOrgs).toBe(1);
    expect(a.kpis.canceledCount).toBe(1);
    expect(a.kpis.openArMinor).toBe(19900);
    expect(a.kpis.openInvoiceCount).toBe(1);

    expect(a.revenueByDay).toHaveLength(7);
    expect(a.revenueByDay[1]).toMatchObject({ collectedMinor: 69600, refundedMinor: 0 });
    expect(a.revenueByDay[2]).toMatchObject({ collectedMinor: 19900, refundedMinor: 0 });
    expect(a.revenueByDay[3]).toMatchObject({ collectedMinor: 0, refundedMinor: 5000 });

    expect(a.signupsByDay[1]).toMatchObject({ orgs: 1, subscriptions: 1 });

    expect(a.subsByPlan).toHaveLength(1);
    expect(a.subsByPlan[0]).toMatchObject({ planId: "p1", name: "Launch", active: 1, pastDue: 1 });

    expect(a.revenueByMonth).toHaveLength(12);
    const nov2023 = a.revenueByMonth.find((m) => m.month === "2023-11");
    expect(nov2023?.collectedMinor).toBe(69600 + 19900);
    const oct2023 = a.revenueByMonth.find((m) => m.month === "2023-10");
    expect(oct2023?.collectedMinor).toBe(19900);
  });

  it("returns empty aggregates when there is no data", async () => {
    const store = memoryStore();
    const a = await getAnalytics(store, FROM, TO);
    expect(a.kpis.mrrMinor).toBe(0);
    expect(a.kpis.revenueCollectedMinor).toBe(0);
    expect(a.revenueByDay).toHaveLength(7);
    expect(a.subsByPlan).toHaveLength(0);
  });
});
