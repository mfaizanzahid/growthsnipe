import { describe, expect, it } from "vitest";
import { analyzeWindow, buildDataQuality, computeDeltas, pctChange } from "../src/server/briefing/analyze";
import type { WindowData } from "../src/server/briefing/types";
import type { OrderRecord } from "../src/server/providers/types";

const TZ = "Asia/Karachi";
const AS_OF = new Date("2026-10-18T02:30:00.000Z"); // 07:30 on the 18th, PKT

function order(p: Partial<OrderRecord>): OrderRecord {
  return {
    id: 'o',
    status: 'scheduled',
    scheduledAt: '2026-10-17T06:00:00.000Z',
    total: 10000,
    currency: 'USD',
    ...p,
  };
}

function windowData(over: Partial<WindowData> = {}): WindowData {
  return {
    window: {
      from: '2026-10-16T19:00:00.000Z',
      to: '2026-10-17T19:00:00.000Z',
      days: 1,
      label: 'Yesterday',
    },
    orders: [],
    cancelledCount: 0,
    cancelledExact: false,
    eventCount: 0,
    retrieved: 0,
    truncated: false,
    peopleNamesUsable: true,
    providerLimits: [],
    ...over,
  };
}

describe("multi-inspector jobs", () => {
  // Live strings from the Jalop workspace (2026-10-17): Spectora packs several
  // inspectors into one field and marks provisional assignments "(requested)".
  // Grouping on the raw string reported 6 inspectors for 3 people and split one
  // person's workload across two rows.
  const orders = [
    order({ id: '1', status: 'completed', inspectorName: 'Taylor Reynolds', total: 10000 }),
    order({ id: '2', status: 'completed', inspectorName: 'Alex Bruhl', total: 10000 }),
    order({ id: '3', status: 'completed', inspectorName: 'Alex Bruhl, Jim Reynolds', total: 10000 }),
    order({ id: '4', status: 'completed', inspectorName: 'Alex Bruhl (requested)', total: 10000 }),
  ];

  it('splits comma-joined inspectors and strips the requested suffix', () => {
    const m = analyzeWindow(
      windowData({ orders, retrieved: 4 }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    const byName = new Map(m.inspectors.map((i) => [i.name, i.orders]));
    expect(byName.get('Alex Bruhl')).toBe(3); // solo + shared + requested
    expect(byName.get('Taylor Reynolds')).toBe(1);
    expect(byName.get('Jim Reynolds')).toBe(1);
    // Three real people, not five string variants.
    expect(m.inspectors).toHaveLength(3);
    expect(m.inspectors.some((i) => i.name.includes(','))).toBe(false);
    expect(m.inspectors.some((i) => i.name.includes('requested'))).toBe(false);
  });

  it('counts team jobs and says so, because inspector counts overlap', () => {
    const m = analyzeWindow(windowData({ orders, retrieved: 4 }), TZ, AS_OF, ['2026-10-17']);
    expect(m.teamJobs).toBe(1);
    const dq = buildDataQuality(windowData(), windowData(), m, true);
    expect(dq.omissions.join(' ')).toContain('list more than one inspector');
  });

  it('reports no team jobs for single-inspector orders', () => {
    const single = orders.filter((o) => !String(o.inspectorName).includes(','));
    const m = analyzeWindow(windowData({ orders: single, retrieved: single.length }), TZ, AS_OF, ['2026-10-17']);
    expect(m.teamJobs).toBe(0);
  });

  it('drops UUID entries inside a multi-inspector list', () => {
    const uuid = '4f06d537-b74a-4833-99e9-2228eaa1f413';
    const m = analyzeWindow(
      windowData({
        orders: [order({ id: '1', status: 'completed', inspectorName: `Mike P, ${uuid}` })],
        retrieved: 1,
      }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    expect(m.inspectors.map((i) => i.name)).toEqual(['Mike P']);
  });
});

describe("disjoint cancellation counting", () => {
  // Regression: Spectora's default listing EXCLUDES cancelled inspections, so
  // the cancel filter returns a separate population. Treating it as a subset
  // made a month with a real 8.8% cancel rate report "0 cancellations, rate
  // unavailable". Numbers below mirror the live 2026-10-17 probe.
  const listed = Array.from({ length: 103 }, (_, i) =>
    order({ id: `c${i}`, status: 'completed', total: 65000, scheduledAt: '2026-09-25T13:00:00.000Z' }),
  );

  function disjoint(over: Partial<WindowData> = {}) {
    return windowData({
      orders: listed,
      cancelledCount: 10,
      cancelledExact: true,
      cancelledDisjoint: true,
      retrieved: 103,
      totalEstimate: 103,
      ...over,
    });
  }

  it("adds the disjoint cancelled population to the window total", () => {
    const m = analyzeWindow(disjoint(), TZ, AS_OF, ['2026-09-25']);
    expect(m.orders).toBe(113); // 103 listed + 10 cancelled, not 103
    expect(m.cancelled).toBe(10);
    expect(m.completed).toBe(103);
    expect(m.open).toBe(0);
    expect(m.cancelledBounded).toBe(false);
  });

  it("computes the cancel rate against the full window total", () => {
    const m = analyzeWindow(disjoint(), TZ, AS_OF, ['2026-09-25']);
    expect(m.cancelRatePct).toBeCloseTo(8.8, 1);
  });

  it("keeps completed/open from the listing, uncancelled by the filter", () => {
    const mixed = [
      ...Array.from({ length: 8 }, (_, i) => order({ id: `c${i}`, status: 'completed', total: 65000 })),
      ...Array.from({ length: 2 }, (_, i) => order({ id: `o${i}`, status: 'scheduled' })),
    ];
    const m = analyzeWindow(
      windowData({
        orders: mixed,
        cancelledCount: 5,
        cancelledExact: true,
        cancelledDisjoint: true,
        retrieved: 10,
      }),
      TZ,
      AS_OF,
      ['2026-09-25'],
    );
    expect(m.completed).toBe(8);
    expect(m.open).toBe(2);
    expect(m.cancelled).toBe(5);
    expect(m.orders).toBe(15);
  });

  it("explains the disjoint source in data quality", () => {
    const m = analyzeWindow(disjoint(), TZ, AS_OF, ['2026-09-25']);
    const dq = buildDataQuality(disjoint(), disjoint(), m, true);
    expect(dq.omissions.join(' ')).toContain('excluded from the provider default listing');
    expect(dq.omissions.join(' ')).not.toContain('bounded estimate');
  });

it("still reports bounded when the listing itself was truncated", () => {
    const capped = disjoint({ orders: listed.slice(0, 5), truncated: true, retrieved: 5, totalEstimate: 103 });
    const m = analyzeWindow(capped, TZ, AS_OF, ['2026-09-25']);
    expect(m.orders).toBe(15); // 5 listed + 10 cancelled
    const dq = buildDataQuality(capped, disjoint(), m, true);
    expect(dq.truncated).toBe(true);
    expect(dq.omissions.join(' ')).toContain('capped at 5');
  });
});

describe("window metrics", () => {
  it("splits orders into completed / cancelled / open", () => {
    const m = analyzeWindow(
      windowData({
        orders: [
          order({ id: '1', status: 'completed', total: 50000, paid: true }),
          order({ id: '2', status: 'completed', total: 30000, paid: false }),
          order({ id: '3', status: 'cancelled' }),
          order({ id: '4' }),
        ],
        retrieved: 4,
      }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    expect(m.orders).toBe(4);
    expect(m.completed).toBe(2);
    expect(m.cancelled).toBe(1);
    expect(m.open).toBe(1);
    expect(m.revenueMinor).toBe(80000);
    expect(m.avgTicketMinor).toBe(40000);
    expect(m.revenuePerDayMinor).toBe(80000);
  });

  it("tracks paid vs unpaid completed work (collection risk)", () => {
    const m = analyzeWindow(
      windowData({
        orders: [
          order({ id: '1', status: 'completed', total: 50000, paid: true }),
          order({ id: '2', status: 'completed', total: 30000, paid: false }),
          order({ id: '3', status: 'completed', total: 20000 }),
        ],
        retrieved: 3,
      }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    expect(m.paidOrders).toBe(1);
    expect(m.unpaidOrders).toBe(1);
    expect(m.unpaidAmountMinor).toBe(30000);
  });

  it("suppresses the cancel rate on a tiny sample", () => {
    const few = analyzeWindow(
      windowData({ orders: [order({ status: 'cancelled' })], retrieved: 1 }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    expect(few.cancelRatePct).toBeNull();

    const enough = analyzeWindow(
      windowData({
        orders: Array.from({ length: 5 }, () => order({ status: 'cancelled' })),
        retrieved: 5,
      }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    expect(enough.cancelRatePct).toBe(100);
  });

  it("counts open orders that are already past their scheduled time", () => {
    const m = analyzeWindow(
      windowData({
        orders: [
          order({ id: '1', scheduledAt: '2026-10-17T06:00:00.000Z' }), // past
          order({ id: '2', scheduledAt: '2026-10-18T06:00:00.000Z' }), // future
          order({ id: '3', status: 'completed', scheduledAt: '2026-10-17T06:00:00.000Z' }),
        ],
        retrieved: 3,
      }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    expect(m.overdueOpenOrders).toBe(1);
  });

  it("prefers an exact provider cancel count but never double counts", () => {
    const orders = [
      order({ id: '1', status: 'completed' }),
      order({ id: '2', status: 'cancelled' }),
      order({ id: '3' }),
    ];
    // Provider says 5 cancelled but only 3 orders were fetched: the count cannot
    // be reconciled, so we keep the in-set evidence (1 cancelled, 1 open) and
    // suppress the rate rather than inflating the total.
    const bounded = analyzeWindow(
      windowData({ orders, cancelledCount: 5, cancelledExact: true, retrieved: 3 }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    expect(bounded.cancelledBounded).toBe(true);
    expect(bounded.cancelled).toBe(1);
    expect(bounded.open).toBe(1);
    expect(bounded.cancelRatePct).toBeNull();

    // A provider count that fits inside the retrieved set is used verbatim.
    const exact = analyzeWindow(
      windowData({ orders, cancelledCount: 1, cancelledExact: true, retrieved: 3 }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    expect(exact.cancelledBounded).toBe(false);
    expect(exact.cancelled).toBe(1);
    expect(exact.open).toBe(1);
  });

  it("builds referral and service mix from labelled records", () => {
    const m = analyzeWindow(
      windowData({
        orders: [
          order({ id: '1', status: 'completed', total: 10000, referralSource: 'Google', serviceType: 'Inspection' }),
          order({ id: '2', status: 'completed', total: 30000, referralSource: 'Google', serviceType: 'Radon' }),
          order({ id: '3', status: 'completed', total: 5000, referralSource: 'Referral', serviceType: 'Inspection' }),
        ],
        retrieved: 3,
      }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    expect(m.referralMix[0]).toEqual({ label: 'Google', orders: 2, revenueMinor: 40000 });
    expect(m.serviceMix[0]).toEqual({ label: 'Inspection', orders: 2, revenueMinor: 15000 });
  });

  it("ignores UUID-shaped labels instead of counting them as people or sources", () => {
    const uuid = '4f06d537-b74a-4833-99e9-2228eaa1f413';
    const m = analyzeWindow(
      windowData({
        orders: [
          order({ id: '1', status: 'completed', total: 10000, referralSource: uuid, serviceType: uuid }),
          order({ id: '2', status: 'completed', total: 10000, referralSource: uuid, serviceType: uuid }),
        ],
        retrieved: 2,
      }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    expect(m.referralMix).toEqual([]);
    expect(m.serviceMix).toEqual([]);
  });

  it("suppresses inspector load when the provider returns identifiers", () => {
    const uuid = '4f06d537-b74a-4833-99e9-2228eaa1f413';
    const orders = [
      order({ id: '1', status: 'completed', inspectorName: 'Mike P', total: 10000 }),
      order({ id: '2', status: 'completed', inspectorName: 'Mike P', total: 20000 }),
      order({ id: '3', status: 'completed', inspectorName: 'Jane S', total: 5000 }),
    ];
    const named = analyzeWindow(windowData({ orders, retrieved: 3 }), TZ, AS_OF, ['2026-10-17']);
    expect(named.inspectors.map((i) => i.name)).toEqual(['Mike P', 'Jane S']);
    expect(named.inspectors[0]).toEqual({ name: 'Mike P', orders: 2, revenueMinor: 30000 });

    // ISN-style: UUIDs in the people fields.
    const ids = analyzeWindow(
      windowData({ orders: orders.map((o) => ({ ...o, inspectorName: uuid })), retrieved: 3, peopleNamesUsable: false }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    expect(ids.inspectors).toEqual([]);
  });

  it("buckets orders into local days", () => {
    // 23:30 UTC on the 16th is already 04:30 on the 17th in Karachi, so both
    // orders below belong to the 17th, not the 16th.
    const m = analyzeWindow(
      windowData({
        orders: [
          order({ id: '1', status: 'completed', scheduledAt: '2026-10-16T23:30:00.000Z', total: 10000 }),
          order({ id: '2', status: 'cancelled', scheduledAt: '2026-10-17T10:00:00.000Z' }),
        ],
        retrieved: 2,
      }),
      TZ,
      AS_OF,
      ['2026-10-16', '2026-10-17'],
    );
    expect(m.dailySeries).toHaveLength(2);
    expect(m.dailySeries[0]).toEqual({ day: '2026-10-16', orders: 0, completed: 0, cancelled: 0, revenueMinor: 0 });
    expect(m.dailySeries[1]).toEqual({ day: '2026-10-17', orders: 2, completed: 1, cancelled: 1, revenueMinor: 10000 });
  });
});

describe("deltas", () => {
  it("computes percentage change and refuses a zero baseline", () => {
    expect(pctChange(120, 100)).toBe(20);
    expect(pctChange(80, 100)).toBe(-20);
    // 0 → anything is not a meaningful percentage; null instead of Infinity.
    expect(pctChange(50, 0)).toBeNull();
    expect(pctChange(0, 100)).toBe(-100);
    expect(pctChange(null, 100)).toBeNull();
  });

  it("compares current against the previous period", () => {
    const current = analyzeWindow(
      windowData({ orders: [order({ status: 'completed', total: 10000 })], retrieved: 1 }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    const previous = analyzeWindow(
      windowData({ orders: [order({ status: 'completed', total: 20000 })], retrieved: 1 }),
      TZ,
      AS_OF,
      ['2026-10-16'],
    );
    const d = computeDeltas(current, previous);
    expect(d.ordersPct).toBe(0);
    expect(d.revenuePct).toBe(-50);
    expect(d.avgTicketPct).toBe(-50);
  });

  it("returns nulls when there is no baseline", () => {
    const current = analyzeWindow(
      windowData({ orders: [order({ status: 'completed' })], retrieved: 1 }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    expect(computeDeltas(current, null)).toEqual({
      ordersPct: null,
      revenuePct: null,
      avgTicketPct: null,
      cancelRatePoints: null,
    });
  });
});

describe("data quality", () => {
  it("discloses capped retrieval, unusable names and missing baselines", () => {
    const m = analyzeWindow(
      windowData({ orders: [order({ status: 'completed' })], retrieved: 1 }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    const dq = buildDataQuality(
      windowData({ truncated: true, retrieved: 100, totalEstimate: 900, peopleNamesUsable: false }),
      null,
      m,
      false,
    );
    expect(dq.truncated).toBe(true);
    expect(dq.retrieved).toBe(100);
    expect(dq.totalEstimate).toBe(900);
    expect(dq.omissions.join(' ')).toContain('capped at 100 of about 900');
    expect(dq.omissions.join(' ')).toContain('agent identifiers rather than names');
    expect(dq.omissions.join(' ')).toContain('No previous-period baseline');
  });

  it("flags completed orders with no payment flag", () => {
    const m = analyzeWindow(
      windowData({
        orders: [
          order({ status: 'completed', total: 10000 }),
          order({ status: 'completed', total: 10000 }),
        ],
        retrieved: 2,
      }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    const dq = buildDataQuality(windowData(), windowData(), m, true);
    expect(dq.omissions.join(' ')).toContain('no payment flag');
  });

  it("says nothing about unpaid when every completed order has a flag", () => {
    const m = analyzeWindow(
      windowData({
        orders: [order({ status: 'completed', total: 10000, paid: true })],
        retrieved: 1,
      }),
      TZ,
      AS_OF,
      ['2026-10-17'],
    );
    const dq = buildDataQuality(
      windowData({ cancelledExact: true }),
      windowData({ cancelledExact: true }),
      m,
      true,
    );
    expect(dq.omissions).toEqual([]);
    expect(dq.truncated).toBe(false);
  });

  it("dedupes provider limits reported by both windows", () => {
    const m = analyzeWindow(windowData(), TZ, AS_OF, ['2026-10-17']);
    const limit = ['page size capped at 200'];
    const dq = buildDataQuality(
      windowData({ providerLimits: limit }),
      windowData({ providerLimits: limit }),
      m,
      true,
    );
    expect(dq.providerLimits).toEqual(limit);
  });

  it("reports event unavailability separately from zero events", () => {
    const m = analyzeWindow(windowData(), TZ, AS_OF, ['2026-10-17']);
    const dq = buildDataQuality(windowData({ eventUnavailable: true }), windowData(), m, true);
    expect(dq.omissions.join(' ')).toContain('Events could not be read');
  });
});