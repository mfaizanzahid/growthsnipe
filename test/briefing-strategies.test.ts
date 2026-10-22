import { describe, expect, it, vi } from "vitest";
import { spectoraStrategy, strategyFor } from "../src/server/briefing/providers/strategies";
import { SPECTORA_PAGE_MAX } from "../src/server/providers/spectora/params";
import {
  DEFAULT_BRIEFING_MAX_PAGES,
  DEFAULT_ISN_SAFETY_LIMIT,
  briefingMaxPages,
} from "../src/server/lib/retrieval-limits";
import type { BusinessProviderAdapter, OrderRecord } from "../src/server/providers/types";
import type { AnalysisWindow } from "../src/server/briefing/windows";

const WINDOW: AnalysisWindow = {
  from: '2026-10-16T19:00:00.000Z',
  to: '2026-10-17T19:00:00.000Z',
  days: 1,
  label: 'Yesterday',
};

function order(p: Partial<OrderRecord> = {}): OrderRecord {
  return { id: 'o1', status: 'completed', total: 45000, currency: 'USD', ...p };
}

type OrderInput = Parameters<BusinessProviderAdapter['searchOrders']>[0];

/** Records every call so the test can assert exactly which params were sent. */
function recordingAdapter(over: Partial<BusinessProviderAdapter> = {}) {
  const searchOrders = vi.fn(async (_input: OrderInput) => ({
    items: [order()],
    totalEstimate: 1,
  }));
  const searchEvents = vi.fn(async (_input: { from?: string; to?: string; limit: number }) => ({ items: [] }));
  const adapter = {
    searchOrders,
    searchEvents,
    searchClients: vi.fn(async (_input: { limit: number }) => ({ items: [] })),
    searchAgents: vi.fn(async (_input: { limit: number }) => ({ items: [] })),
    ...over,
  } as unknown as BusinessProviderAdapter;
  // Return the EFFECTIVE mocks: a test that overrides searchOrders expects to
  // inspect its own spy, not the placeholder above.
  return {
    adapter,
    searchOrders: (adapter.searchOrders as unknown) as typeof searchOrders,
    searchEvents: (adapter.searchEvents as unknown) as typeof searchEvents,
  };
}

describe("strategy registry", () => {
  it("resolves verified plans only", () => {
    expect(strategyFor('spectora')?.provider).toBe('spectora');
    expect(strategyFor('isn')?.provider).toBe('isn');
    // Coming-soon providers have no probed contract, so no briefing plan.
    expect(strategyFor('servicetitan')).toBeNull();
    expect(strategyFor('jobber')).toBeNull();
    expect(strategyFor('nonsense')).toBeNull();
  });

  it("marks ISN as single-window until its payloads are probed", () => {
    expect(spectoraStrategy().supportsComparison).toBe(true);
    // Enabled 2026-10-17 (owner decision): the item cap and the truncation
    // caveat carry the full-collection payload risk instead of silently
    // disabling period-over-period comparison on ISN.
    expect(strategyFor('isn')!.supportsComparison).toBe(true);
  });

  it("marks people names usable for both providers (ISN /json carries *_display)", () => {
    expect(spectoraStrategy().peopleNamesUsable).toBe(true);
    // ISN /json/orders exposes inspectorN_display / agent_display, so per-person
    // metrics are reported (re-probed live 2026-10-18; the index-only rows that
    // returned UUIDs are no longer on the read path).
    expect(strategyFor('isn')!.peopleNamesUsable).toBe(true);
  });
});

describe("spectora collection", () => {
  it("windows orders, page size 200, and reads an exact cancel count", async () => {
    const { adapter, searchOrders, searchEvents } = recordingAdapter();
    const data = await spectoraStrategy().collect(adapter, WINDOW);

    const orderCalls = searchOrders.mock.calls.map((c) => c[0]);
    const paged = orderCalls.find((c) => c.status === undefined);
    expect(paged?.from).toBe(WINDOW.from);
    expect(paged?.to).toBe(WINDOW.to);
    expect(paged?.limit).toBe(SPECTORA_PAGE_MAX); // provider maximum, not a guess

    // The cancel probe uses only the verified filter, with a 1-item page.
    const cancel = orderCalls.find((c) => c.status !== undefined);
    expect(cancel?.status).toBe('cancelled');
    expect(cancel?.limit).toBe(1);

    expect(data.cancelledExact).toBe(true);
    expect(data.peopleNamesUsable).toBe(true);
    expect(searchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ from: WINDOW.from, to: WINDOW.to }),
    );
  });

  it("never sends an unverified status filter", async () => {
    const { adapter, searchOrders } = recordingAdapter();
    await spectoraStrategy().collect(adapter, WINDOW);
    for (const call of searchOrders.mock.calls) {
      const status = call[0].status;
      // Only cancelled/canceled have a verified REST equivalent; anything else
      // is dropped by the adapter, so it must never appear here.
      expect([undefined, 'cancelled']).toContain(status);
    }
  });

  it("follows pagination and reports truncation when the cap is hit", async () => {
    let pagesFetched = 0;
    const { adapter } = recordingAdapter({
      searchOrders: vi.fn(async (input: { cursor?: string; status?: string }) => {
        // Only the windowed list pass paginates; the cancel probe answers from
        // totalEstimate and must not disturb the page counter.
        if (input.status !== undefined) return { items: [], totalEstimate: 3 };
        pagesFetched += 1;
        return {
          items: [order({ id: `o${pagesFetched}` })],
          nextCursor: pagesFetched < 5 ? String(pagesFetched + 1) : undefined,
          totalEstimate: 42,
        };
      }),
    });
    const data = await spectoraStrategy().collect(adapter, WINDOW);
    expect(pagesFetched).toBe(5); // bounded, never unbounded
    expect(data.truncated).toBe(true);
    expect(data.totalEstimate).toBe(42);
    expect(data.retrieved).toBe(5);
  });

  it("degrades to a caveat when events fail instead of failing the window", async () => {
    const { adapter } = recordingAdapter({
      searchEvents: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const data = await spectoraStrategy().collect(adapter, WINDOW);
    expect(data.eventUnavailable).toBe(true);
    expect(data.eventCount).toBe(0);
    expect(data.orders.length).toBe(1);
  });
});

describe("page budget", () => {
  /** Fake a provider holding `total` orders, serving full pages like Spectora does. */
  function pagedAdapter(total: number) {
    let page = 0;
    return recordingAdapter({
      searchOrders: vi.fn(async (input: { cursor?: string; status?: string }) => {
        if (input.status !== undefined) return { items: [], totalEstimate: 0 };
        page += 1;
        const fetched = page * SPECTORA_PAGE_MAX;
        const last = fetched >= total;
        // Real pages are full, so items.length reconciles with totalEstimate.
        const size = Math.min(SPECTORA_PAGE_MAX, total - (page - 1) * SPECTORA_PAGE_MAX);
        return {
          items: Array.from({ length: size }, (_, i) => order({ id: `o${page}-${i}` })),
          nextCursor: last ? undefined : String(page + 1),
          totalEstimate: total,
        };
      }),
    });
  }

  it("reads a large-but-reachable window completely instead of stopping at an arbitrary cap", async () => {
    // 6,000 orders = 30 pages at 200/page. This is the case that used to be
    // silently truncated at 5 pages (1,000 orders) — the briefing then
    // under-reported revenue while claiming completeness.
    const { adapter, searchOrders } = pagedAdapter(6000);
    const data = await spectoraStrategy().collect(adapter, WINDOW);

    let pagedCalls = 0;
    for (const c of searchOrders.mock.calls) if (c[0].status === undefined) pagedCalls += 1;
    expect(pagedCalls).toBe(30);
    expect(data.truncated).toBe(false);
    expect(data.retrieved).toBe(6000);
    expect(data.totalEstimate).toBe(6000);
  });

  it("stops at the budget when a window is genuinely too large, and says so", async () => {
    const { adapter } = pagedAdapter(6000);
    const data = await spectoraStrategy(4).collect(adapter, WINDOW);
    expect(data.retrieved).toBe(800); // 4 full pages
    // The provider still had pages pending, so this is disclosed, not silent.
    expect(data.truncated).toBe(true);
    expect(data.providerLimits.join(' ')).toContain('at most 4 pages per window');
  });

  it("uses the documented default budget", () => {
    expect(DEFAULT_BRIEFING_MAX_PAGES).toBe(50); // 10,000 orders per window
    expect(briefingMaxPages(undefined)).toBe(DEFAULT_BRIEFING_MAX_PAGES);
    expect(briefingMaxPages({})).toBe(DEFAULT_BRIEFING_MAX_PAGES);
  });

  it("lets a deployment override the budget, ignoring nonsense", () => {
    expect(briefingMaxPages({ BRIEFING_MAX_PAGES: "12" })).toBe(12);
    expect(briefingMaxPages({ BRIEFING_MAX_PAGES: " 7 " })).toBe(7);
    // A bad value must never disable truncation disclosure inside a cron run.
    expect(briefingMaxPages({ BRIEFING_MAX_PAGES: "0" })).toBe(DEFAULT_BRIEFING_MAX_PAGES);
    expect(briefingMaxPages({ BRIEFING_MAX_PAGES: "-3" })).toBe(DEFAULT_BRIEFING_MAX_PAGES);
    expect(briefingMaxPages({ BRIEFING_MAX_PAGES: "abc" })).toBe(DEFAULT_BRIEFING_MAX_PAGES);
  });

  it("passes the resolved budget through the registry", async () => {
    const { adapter, searchOrders } = pagedAdapter(6000);
    await strategyFor('spectora', 3)!.collect(adapter, WINDOW);
    let pagedCalls = 0;
    for (const c of searchOrders.mock.calls) if (c[0].status === undefined) pagedCalls += 1;
    expect(pagedCalls).toBe(3);
  });
});

describe("isn collection", () => {
  it("requests one whole /json window and reports names + exact cancels", async () => {
    const { adapter, searchOrders } = recordingAdapter();
    const data = await strategyFor('isn')!.collect(adapter, WINDOW);
    expect(searchOrders).toHaveBeenCalledTimes(1);
    expect(searchOrders.mock.calls[0]![0]).toMatchObject({
      from: WINDOW.from,
      to: WINDOW.to,
      limit: DEFAULT_ISN_SAFETY_LIMIT,
    });
    // /json/orders carries *_display names, so per-inspector metrics are on.
    expect(data.peopleNamesUsable).toBe(true);
    // Cancellations come from the vendor's per-row `canceled` flag.
    expect(data.cancelledExact).toBe(true);
    expect(data.providerLimits.join(' ')).toContain('whole days only');
    // No completion flag on /json is disclosed as a provider limit.
    expect(data.providerLimits.join(' ')).toContain('no completion flag');
    // The memory backstop is ours, not an ISN limitation.
    expect(data.providerLimits.join(' ')).not.toMatch(/ISN[^.]*cap/i);
  });

  it('reads two distinct windows when comparing, and discloses the shared boundary day', async () => {
    const strategy = strategyFor('isn')!;
    expect(strategy.supportsComparison).toBe(true);

    const { adapter, searchOrders, searchEvents } = recordingAdapter();
    const current = WINDOW;
    // Mirrors briefingWindows(): the previous period ends where the current starts.
    const previous: AnalysisWindow = {
      from: '2026-09-15T19:00:00.000Z',
      to: current.from,
      days: 1,
      label: 'Previous day',
    };

    await strategy.collect(adapter, current);
    await strategy.collect(adapter, previous);

    expect(searchOrders).toHaveBeenCalledTimes(2);
    expect(searchOrders.mock.calls[0]![0]).toMatchObject({ from: current.from, to: current.to });
    expect(searchOrders.mock.calls[1]![0]).toMatchObject({ from: previous.from, to: previous.to });
    expect(searchEvents).toHaveBeenCalledTimes(2);

    // Day-precision filters mean the boundary day sits in both windows; the
    // comparison must say so rather than implying a clean split.
    const limits = (await strategy.collect(adapter, current)).providerLimits.join(' ');
    expect(limits).toContain('share a boundary day');
  });

  it('never asks for a "not completed" filter (probe showed it returns everything)', async () => {
    const { adapter, searchOrders } = recordingAdapter();
    await strategyFor('isn')!.collect(adapter, WINDOW);
    for (const call of searchOrders.mock.calls) {
      expect(call[0].status).toBeUndefined();
    }
  });

  it("flags truncation when the provider reports more than it returned", async () => {
    const { adapter } = recordingAdapter({
      searchOrders: vi.fn(async () => ({ items: [order()], totalEstimate: 45124 })),
    });
    const data = await strategyFor('isn')!.collect(adapter, WINDOW);
    expect(data.truncated).toBe(true);
    expect(data.totalEstimate).toBe(45124);
  });
});