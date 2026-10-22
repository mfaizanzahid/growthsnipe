import { afterEach, describe, expect, it, vi } from "vitest";
import { IsnAdapter } from "../src/server/providers/isn/adapter";
import { IsnApiError } from "../src/server/providers/isn/client";

const CREDS = {
  companyKey: "guardian",
  host: "goisn.example.com",
  accessKey: "access",
  secretKey: "secret",
};

function adapter() {
  return new IsnAdapter({}, { provider: "isn", credentials: CREDS });
}

/** Minimal `/orders` payload shaped like the live vendor response. */
function ordersPayload(count: number, rows: number) {
  return {
    status: "ok",
    count,
    orders: Array.from({ length: rows }, (_, i) => ({
      oid: i + 1,
      datetimeinspection: "2026-09-20 10:00:00",
      completeddatetime: "2026-09-20 12:00:00",
      totalfee: "350.00",
    })),
  };
}

/**
 * A `/json/orders` row as live-probed 2026-10-18: a bare array entry (no
 * envelope), dollar-float `total_fee`, `*_display` names, `show`/`canceled`
 * flags and no completion flag.
 */
function jsonOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord_1",
    oid: 1,
    address1: "12 Main St",
    city: "Austin",
    state: "TX",
    postal_code: "78701",
    datetime: "2026-09-20T10:00:00",
    client_id: "cli_1",
    client_display: "Dana Buyer",
    total_fee: 140.33,
    inspector1_display: "Abraham Levy",
    inspector2_display: "Keegan Russum",
    agent_display: "Ada Agent",
    modified: "2026-09-21T08:00:00",
    report_number: "RN-1",
    show: "yes",
    canceled: "no",
    ...overrides,
  };
}

const WINDOW = { from: "2026-09-18T00:00:00.000Z", to: "2026-10-18T00:00:00.000Z" };

let requests: string[] = [];

function stubFetch(payload: unknown) {
  requests = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    requests.push(String(input));
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

function stubJson(rows: unknown[]) {
  stubFetch(rows);
}

describe("IsnAdapter.searchOrders", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the whole collection regardless of the requested limit, with no cursor", async () => {
    stubFetch(ordersPayload(499, 499));
    const page = await adapter().searchOrders({ limit: 25 });

    // ISN has no paging params, so `limit` cannot shorten a read: the whole
    // batch comes back in one call and there is no cursor to loop with.
    expect(page.items).toHaveLength(499);
    expect(page.nextCursor).toBeUndefined();
    expect(page.totalEstimate).toBe(499);
    // The vendor has no paging params: exactly one request for the whole batch.
    expect(requests).toHaveLength(1);
    expect(requests[0]).not.toMatch(/limit|page|offset|size/i);
  });

  it("returns a large window in one call without an item cap", async () => {
    // Regression, live 2026-10-17 on the ISN org "Guardian": the dashboard
    // snapshot asked for a bulk read of a 30-day window but was silently capped
    // at 200 records. Any cap below the memory backstop must not apply.
    stubFetch(ordersPayload(9000, 9000));
    const page = await adapter().searchOrders({ limit: 100 });
    expect(page.items).toHaveLength(9000);
    expect(page.totalEstimate).toBe(9000);
  });

  it("applies the memory backstop only when configured, keeping the pre-slice total", async () => {
    stubFetch(ordersPayload(9000, 9000));
    const page = await new IsnAdapter(
      { ISN_SAFETY_LIMIT: "5000" },
      { provider: "isn", credentials: CREDS },
    ).searchOrders({ limit: 100 });
    expect(page.items).toHaveLength(5000);
    // The shortfall stays visible as truncation (total > returned) instead of
    // being reported as a smaller "total".
    expect(page.totalEstimate).toBe(9000);
  });

  it("does not report truncation for rows the mapper deliberately drops", async () => {
    // Live 2026-10-18 on "Guardian": `/rest/orders` `count` is "records
    // returned" and includes soft-deleted rows, which the mapper drops
    // (`show: "no"`). That is an intentional exclusion, not a shortfall, so the
    // vendor count must be capped by the mapped length and the page stays a
    // complete read of the whole collection.
    stubFetch({
      status: "ok",
      count: 3,
      orders: [
        { oid: 1, show: "yes", datetimeinspection: "2026-09-20 10:00:00", totalfee: "350.00" },
        { oid: 2, show: "no", datetimeinspection: "2026-09-20 11:00:00", totalfee: "350.00" },
        { oid: 3, show: "yes", datetimeinspection: "2026-09-20 12:00:00", totalfee: "350.00" },
      ],
    });
    const page = await adapter().searchOrders({ limit: 25 });
    expect(page.items).toHaveLength(2);
    expect(page.totalEstimate).toBe(2);
    expect(page.nextCursor).toBeUndefined();
  });

  it("ignores an unusable limit instead of truncating the collection", async () => {
    stubFetch(ordersPayload(499, 499));
    const page = await adapter().searchOrders({ limit: 0 });
    expect(page.items).toHaveLength(499);
  });

  it("maps money to minor units", async () => {
    stubFetch(ordersPayload(1, 1));
    const page = await adapter().searchOrders({ limit: 1 });
    // Canonical `total` carries integer minor units; ISN sends "350.00".
    expect(page.items[0].total).toBe(35000);
    expect(page.items[0].currency).toBe("USD");
    expect(page.items[0].status).toBe("completed");
  });
});

describe("IsnAdapter.searchOrders windowed (/json)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses /json/orders with ISO start/end when a window is given", async () => {
    stubJson([jsonOrder()]);
    const page = await adapter().searchOrders({ limit: 100, ...WINDOW });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("/guardian/json/orders");
    // ISN expects the un-zoned `Y-m-dTH:M:S` instant, and both ends are required.
    expect(requests[0]).toContain("start=2026-09-18T00%3A00%3A00");
    expect(requests[0]).toContain("end=2026-10-18T00%3A00%3A00");
    // /json ignores these, so they must never be sent.
    expect(requests[0]).not.toMatch(/completed=|canceled=|limit=|after=/);
    expect(page.items).toHaveLength(1);
  });

  it("reads the /json shape: money, display names and multi-inspector teams", async () => {
    stubJson([jsonOrder()]);
    const page = await adapter().searchOrders({ limit: 10, ...WINDOW });
    const order = page.items[0];

    // `total_fee` is a dollar float -> integer minor units.
    expect(order.total).toBe(14033);
    expect(order.currency).toBe("USD");
    expect(order.buyerName).toBe("Dana Buyer");
    expect(order.buyingAgentName).toBe("Ada Agent");
    // Several inspectors are joined so splitPeople can treat this as a team job.
    expect(order.inspectorName).toBe("Abraham Levy, Keegan Russum");
    expect(order.address).toBe("12 Main St, Austin, TX, 78701");
    expect(order.clientId).toBe("cli_1");
    expect(order.updatedAt).toBe("2026-09-21T08:00:00");
  });

  it("drops deleted (show:\"no\") orders and sizes totalEstimate to the survivors", async () => {
    stubJson([jsonOrder(), jsonOrder({ id: "ord_2", show: "no" }), jsonOrder({ id: "ord_3" })]);
    const page = await adapter().searchOrders({ limit: 10, ...WINDOW });
    expect(page.items.map((o) => o.id)).toEqual(["ord_1", "ord_3"]);
    // Not truncation: the deleted row is excluded from the vendor count too.
    expect(page.totalEstimate).toBe(2);
  });

  it("derives status: canceled flag wins, past non-cancelled reads completed", async () => {
    stubJson([
      jsonOrder({ id: "past" }),
      jsonOrder({ id: "canceled", canceled: "yes", canceled_date: "2026-09-19 09:00:00" }),
      jsonOrder({ id: "future", datetime: "2199-01-01T10:00:00" }),
    ]);
    const page = await adapter().searchOrders({ limit: 10, ...WINDOW });
    const byId = Object.fromEntries(page.items.map((o) => [o.id, o.status]));
    // /json has no completion flag; a non-cancelled past order is completed.
    expect(byId.past).toBe("completed");
    expect(byId.canceled).toBe("cancelled");
    expect(byId.future).toBe("scheduled");
  });

  it("surfaces a /json failure without leaking keys", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: "bad window" }), { status: 400 }));
    let message = "";
    try {
      await adapter().searchOrders({ limit: 5, ...WINDOW });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain("ISN");
    expect(message).not.toContain("secret");
    expect(message).not.toContain("access");
  });
});

describe("IsnAdapter.searchEvents", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns every event instead of slicing to 100", async () => {
    // `/calendarevents` ignores `limit`; the adapter used to download the whole
    // array and slice it, silently dropping events past the first 100.
    stubFetch({
      status: "ok",
      events: Array.from({ length: 250 }, (_, i) => ({
        id: `e${i}`,
        start: "2026-09-20T10:00:00",
        title: `Event ${i}`,
      })),
    });
    const page = await adapter().searchEvents({ limit: 100 });
    expect(page.items).toHaveLength(250);
    expect(page.totalEstimate).toBe(250);
    expect(page.nextCursor).toBeUndefined();
  });
});

describe("IsnAdapter configuration guards", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects Spectora-shaped credentials with a reconnection message", () => {
    expect(
      () => new IsnAdapter({}, { provider: "isn", credentials: { apiKey: "abc" } }),
    ).toThrow(/companyKey/i);
  });

  it("rejects an empty host", () => {
    expect(() => new IsnAdapter({}, { provider: "isn", credentials: { ...CREDS, host: "" } })).toThrow(
      IsnApiError,
    );
  });

  it("sends the verified path shape and basic auth, and never leaks keys on failure", async () => {
    let seenUrl = "";
    let seenAuth = "";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      seenUrl = String(input);
      seenAuth = new Headers(init?.headers).get("Authorization") ?? "";
      return new Response(JSON.stringify({ status: "error" }), { status: 500 });
    });

    await expect(adapter().searchOrders({ limit: 5 })).rejects.toThrow(IsnApiError);
    expect(seenUrl).toContain("/guardian/rest/orders");
    expect(seenAuth).toMatch(/^Basic /);
    // The error text must not carry the access key or secret.
    let message = "";
    try {
      await adapter().searchOrders({ limit: 5 });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).not.toContain("secret");
    expect(message).not.toContain("accessKey");
  });
});